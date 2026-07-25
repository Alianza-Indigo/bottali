import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, userProfiles } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { generateOpaqueToken, hashToken } from "./tokens";

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  displayName: string | null;
  sessionId: string;
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

export async function createSession(userId: string): Promise<string> {
  const env = getEnv();
  const token = generateOpaqueToken();
  const { ipTruncated, userAgent } = await getRequestMetadata();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    ipTruncated,
    userAgent,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.APP_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
  });

  return token;
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      userStatus: users.status,
      displayName: userProfiles.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
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
  };
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
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ status: "REVOKED", revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
}
