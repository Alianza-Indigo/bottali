import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { mfaCredentials, userProfiles, users } from "@/db/schema";
import { getPendingMfaSession, getRequestMetadata, markSessionMfaVerified } from "@/lib/auth/session";
import { verifyTotpCode } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/security/crypto";
import { hashToken } from "@/lib/auth/tokens";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent, recordSecurityEvent } from "@/lib/audit/log";
import { AppError, RateLimitError, UnauthorizedError } from "@/lib/utils/errors";

const schema = z.object({ code: z.string().min(6).max(64) });

/** Second half of login for a user with MFA enabled: reads the pending session (see
 * lib/auth/session.ts's createSession({requireMfaVerification: true})), checks the
 * submitted code against either the live TOTP or an unused recovery code, and only then
 * marks the session usable. */
export async function POST(request: Request) {
  try {
    const { ipTruncated } = await getRequestMetadata();
    const limiter = getRateLimiter();
    const rl = await limiter.consume(`mfa-login-verify:${ipTruncated ?? "unknown"}`, 10, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const pending = await getPendingMfaSession();
    if (!pending) throw new UnauthorizedError("No hay un inicio de sesión pendiente de verificación.");

    const { code } = await parseJsonBody(request, schema);

    const rows = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, pending.userId)).limit(1);
    const credential = rows[0];
    if (!credential?.enabledAt) throw new UnauthorizedError("MFA no está activado para esta cuenta.");

    let verified = false;
    if (/^\d{6}$/.test(code)) {
      verified = verifyTotpCode(decryptSecret(credential.secretEncrypted), code);
    }

    if (!verified) {
      const codeHash = hashToken(code);
      const remainingCodes = credential.recoveryCodesHash.filter((h) => h !== codeHash);
      if (remainingCodes.length < credential.recoveryCodesHash.length) {
        verified = true;
        // Recovery codes are single-use — consume it now that it's confirmed valid.
        await db.update(mfaCredentials).set({ recoveryCodesHash: remainingCodes }).where(eq(mfaCredentials.id, credential.id));
      }
    }

    if (!verified) {
      await recordSecurityEvent({ kind: "mfa_login_verify_failed", userId: pending.userId, severity: "WARNING" });
      throw new AppError("El código ingresado no es válido.", "INVALID_MFA_CODE", 400);
    }

    await markSessionMfaVerified(pending.sessionId);

    const userRows = await db
      .select({ id: users.id, email: users.email, displayName: userProfiles.displayName })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, pending.userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new UnauthorizedError();

    await recordAuditEvent({ actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id });

    return NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    return handleApiError(error);
  }
}
