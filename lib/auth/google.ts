import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { db } from "@/lib/db/client";
import {
  oauthAccounts,
  roles,
  userProfiles,
  userRoles,
  users,
} from "@/db/schema";
import { getEnv } from "@/lib/env";
import { ForbiddenError } from "@/lib/utils/errors";
import { hashPassword } from "./password";
import { generateOpaqueToken } from "./tokens";
import { sanitizeReturnPath } from "./return-path";

const GOOGLE_PROVIDER = "google";
const FLOW_COOKIE_PATH = "/api/v1/auth/google";
const FLOW_TTL_SECONDS = 10 * 60;
const STATE_COOKIE = "bottali_google_state";
const VERIFIER_COOKIE = "bottali_google_verifier";
const NONCE_COOKIE = "bottali_google_nonce";
const RETURN_COOKIE = "bottali_google_return";

export interface GoogleIdentity {
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function getGoogleConfig() {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("El acceso con Google no está configurado.");
  }

  const redirectUri = new URL(
    "/api/v1/auth/google/callback",
    env.NEXT_PUBLIC_APP_URL,
  ).toString();
  return {
    env,
    redirectUri,
    client: new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    }),
  };
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function flowCookieOptions(isDevelopment: boolean) {
  return {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: "lax" as const,
    path: FLOW_COOKIE_PATH,
    maxAge: FLOW_TTL_SECONDS,
  };
}

export async function createGoogleAuthorizationUrl(nextPath?: string | null): Promise<string> {
  const { client, env } = getGoogleConfig();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error("Google OAuth no pudo generar el desafío PKCE.");

  const state = generateOpaqueToken();
  const nonce = generateOpaqueToken();
  const cookieStore = await cookies();
  const options = flowCookieOptions(env.APP_ENV === "development");

  cookieStore.set(STATE_COOKIE, state, options);
  cookieStore.set(VERIFIER_COOKIE, codeVerifier, options);
  cookieStore.set(NONCE_COOKIE, nonce, options);
  cookieStore.set(RETURN_COOKIE, sanitizeReturnPath(nextPath), options);

  return client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

export async function clearGoogleFlowCookies(): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();
  const options = {
    ...flowCookieOptions(env.APP_ENV === "development"),
    maxAge: 0,
  };
  cookieStore.set(STATE_COOKIE, "", options);
  cookieStore.set(VERIFIER_COOKIE, "", options);
  cookieStore.set(NONCE_COOKIE, "", options);
  cookieStore.set(RETURN_COOKIE, "", options);
}

export async function completeGoogleAuthorization(
  code: string,
  returnedState: string,
): Promise<{ identity: GoogleIdentity; returnPath: string }> {
  const { client, env, redirectUri } = getGoogleConfig();
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  const expectedNonce = cookieStore.get(NONCE_COOKIE)?.value;
  const returnPath = sanitizeReturnPath(cookieStore.get(RETURN_COOKIE)?.value);
  await clearGoogleFlowCookies();

  if (
    !expectedState ||
    !codeVerifier ||
    !expectedNonce ||
    !secureEquals(expectedState, returnedState)
  ) {
    throw new Error("El estado de Google OAuth es inválido o expiró.");
  }

  const { tokens } = await client.getToken({
    code,
    codeVerifier,
    redirect_uri: redirectUri,
  });
  if (!tokens.id_token) throw new Error("Google no devolvió un token de identidad.");

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    !payload.nonce ||
    !secureEquals(expectedNonce, payload.nonce)
  ) {
    throw new Error("La identidad devuelta por Google no es válida.");
  }
  if (env.GOOGLE_ALLOWED_DOMAIN && payload.hd !== env.GOOGLE_ALLOWED_DOMAIN) {
    throw new Error("La cuenta de Google no pertenece al dominio autorizado.");
  }

  return {
    identity: {
      providerAccountId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      displayName: payload.name?.trim() || null,
      avatarUrl: payload.picture || null,
    },
    returnPath,
  };
}

async function findGoogleUser(providerAccountId: string) {
  const rows = await db
    .select({
      userId: oauthAccounts.userId,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(
      and(
        eq(oauthAccounts.provider, GOOGLE_PROVIDER),
        eq(oauthAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function assertGoogleUserAvailable(user: {
  status: string;
  deletedAt: Date | null;
}): void {
  if (
    user.deletedAt ||
    user.status === "SUSPENDED" ||
    user.status === "BLOCKED" ||
    user.status === "DELETED"
  ) {
    throw new ForbiddenError("Esta cuenta no está disponible.");
  }
}

export async function findOrCreateGoogleUser(
  identity: GoogleIdentity,
): Promise<{ userId: string; created: boolean }> {
  const existingUser = await findGoogleUser(identity.providerAccountId);
  if (existingUser) {
    assertGoogleUserAvailable(existingUser);
    await db.transaction(async (tx) => {
      await tx
        .insert(userProfiles)
        .values({
          userId: existingUser.userId,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            updatedAt: new Date(),
          },
        });
      await tx
        .update(oauthAccounts)
        .set({ emailAtLink: identity.email, updatedAt: new Date() })
        .where(
          and(
            eq(oauthAccounts.provider, GOOGLE_PROVIDER),
            eq(oauthAccounts.providerAccountId, identity.providerAccountId),
          ),
        );
      await tx
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, existingUser.userId));
    });
    return { userId: existingUser.userId, created: false };
  }

  const passwordHash = await hashPassword(generateOpaqueToken());
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${GOOGLE_PROVIDER}:${identity.providerAccountId}`}))`,
    );

    const linkedRows = await tx
      .select({
        userId: oauthAccounts.userId,
        status: users.status,
        deletedAt: users.deletedAt,
      })
      .from(oauthAccounts)
      .innerJoin(users, eq(users.id, oauthAccounts.userId))
      .where(
        and(
          eq(oauthAccounts.provider, GOOGLE_PROVIDER),
          eq(oauthAccounts.providerAccountId, identity.providerAccountId),
        ),
      )
      .limit(1);
    if (linkedRows[0]) {
      assertGoogleUserAvailable(linkedRows[0]);
      return { userId: linkedRows[0].userId, created: false };
    }

    const emailConflict = await tx
      .select({
        id: users.id,
        status: users.status,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${identity.email}`)
      .limit(1);
    if (emailConflict[0]) {
      assertGoogleUserAvailable(emailConflict[0]);
      await tx.insert(oauthAccounts).values({
        userId: emailConflict[0].id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: identity.providerAccountId,
        emailAtLink: identity.email,
      });
      await tx
        .insert(userProfiles)
        .values({
          userId: emailConflict[0].id,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            updatedAt: new Date(),
          },
        });
      await tx
        .update(users)
        .set({
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, emailConflict[0].id));
      return { userId: emailConflict[0].id, created: false };
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: identity.email,
        emailVerifiedAt: new Date(),
        passwordHash,
        status: "ACTIVE",
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id });
    if (!user) throw new Error("No fue posible crear el usuario de Google.");

    await tx.insert(userProfiles).values({
      userId: user.id,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    });
    await tx.insert(oauthAccounts).values({
      userId: user.id,
      provider: GOOGLE_PROVIDER,
      providerAccountId: identity.providerAccountId,
      emailAtLink: identity.email,
    });

    const [userRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, "USER"))
      .limit(1);
    if (!userRole) throw new Error("El rol USER no está configurado.");
    await tx.insert(userRoles).values({ userId: user.id, roleId: userRole.id });

    return { userId: user.id, created: true };
  });
}
