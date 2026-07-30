import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, userProfiles, mfaCredentials, organizations } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { generateOpaqueToken, hashToken } from "./tokens";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";
import { resolveUserOrganization } from "@/lib/organizations/service";

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  displayName: string | null;
  sessionId: string;
  organizationId: string;
  organization: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    iconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    customDomain: string | null;
  };
}

function truncateIp(ip: string | null): string | null {
  if (!ip) return null;
  // IPv4: zero the last octet. IPv6: keep first 4 groups. Never store a full client IP.
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts.slice(0, 3).join(".")}.0`;
  }
  return `${ip.split(":").slice(0, 4).join(":")}::`;
}

export async function getRequestMetadata() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null;
  return {
    ipTruncated: truncateIp(ip),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
  const rows = await db
    .select({ enabledAt: mfaCredentials.enabledAt })
    .from(mfaCredentials)
    .where(eq(mfaCredentials.userId, userId))
    .limit(1);
  return Boolean(rows[0]?.enabledAt);
}

/**
 * §28 MFA: when `requireMfaVerification` is set (the caller already confirmed the password
 * AND that this user has MFA enabled), the session row is created but left "pending" —
 * `mfaVerifiedAt` stays null, and getCurrentSession() treats that as not-logged-in for a
 * user with MFA enabled. The cookie still gets set so the pending session can be found again
 * by the mfa/login-verify endpoint, but nothing else in the app can use it until that
 * endpoint calls markSessionMfaVerified().
 */
export async function createSession(
  userId: string,
  options?: { requireMfaVerification?: boolean; organizationId?: string },
): Promise<string> {
  const env = getEnv();
  const token = generateOpaqueToken();
  const { ipTruncated, userAgent } = await getRequestMetadata();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);
  const organization = await resolveUserOrganization(userId, options?.organizationId);

  await db.insert(sessions).values({
    userId,
    organizationId: organization.id,
    tokenHash: hashToken(token),
    ipTruncated,
    userAgent,
    expiresAt,
    mfaVerifiedAt: options?.requireMfaVerification ? null : new Date(),
  });

  const cookieStore = await cookies();
  cookieStore.set(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.APP_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
  });
  // Deliberately NOT httpOnly — client JS must be able to read this to echo it back as the
  // X-CSRF-Token header (see lib/api/client.ts and middleware.ts).
  cookieStore.set(CSRF_COOKIE_NAME, generateOpaqueToken(), {
    httpOnly: false,
    secure: env.APP_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
  });

  return token;
}

async function loadSessionRowByToken(token: string) {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      expiresAt: sessions.expiresAt,
      mfaVerifiedAt: sessions.mfaVerifiedAt,
      userId: users.id,
      email: users.email,
      userStatus: users.status,
      displayName: userProfiles.displayName,
      organizationId: organizations.id,
      organizationSlug: organizations.slug,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
      organizationLogoUrl: organizations.logoUrl,
      organizationIconUrl: organizations.iconUrl,
      organizationPrimaryColor: organizations.primaryColor,
      organizationSecondaryColor: organizations.secondaryColor,
      organizationCustomDomain: organizations.customDomain,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, sessions.organizationId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (row.userStatus === "SUSPENDED" || row.userStatus === "BLOCKED" || row.userStatus === "DELETED") {
    return null;
  }
  if (row.organizationStatus !== "ACTIVE") return null;
  return row;
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const row = await loadSessionRowByToken(token);
  if (!row) return null;
  // A session pending MFA verification grants nothing — only mfa/login-verify's
  // getPendingMfaSession() below can see it, and only until the code is confirmed.
  if (!row.mfaVerifiedAt) return null;

  // Fire-and-forget last-seen bump; never block the request on it.
  void db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, row.sessionId))
    .catch(() => undefined);

  return {
    id: row.userId,
    email: row.email,
    status: row.userStatus,
    displayName: row.displayName,
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    organization: {
      id: row.organizationId,
      slug: row.organizationSlug,
      name: row.organizationName,
      logoUrl: row.organizationLogoUrl,
      iconUrl: row.organizationIconUrl,
      primaryColor: row.organizationPrimaryColor,
      secondaryColor: row.organizationSecondaryColor,
      customDomain: row.organizationCustomDomain,
    },
  };
}

/** Used only by POST /api/v1/auth/mfa/login-verify: finds the session pending a TOTP code,
 * regardless of mfaVerifiedAt — that's the one field this function's caller is trying to
 * set. Never exposed as a general-purpose session lookup. */
export async function getPendingMfaSession(): Promise<{ sessionId: string; userId: string } | null> {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const row = await loadSessionRowByToken(token);
  if (!row || row.mfaVerifiedAt) return null;
  return { sessionId: row.sessionId, userId: row.userId };
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function destroyCurrentSession(): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.AUTH_COOKIE_NAME)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(env.AUTH_COOKIE_NAME);
  cookieStore.delete(CSRF_COOKIE_NAME);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ status: "REVOKED", revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
}
