import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { loginSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, getRequestMetadata } from "@/lib/auth/session";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { recordAuditEvent, recordSecurityEvent } from "@/lib/audit/log";
import { AppError, RateLimitError } from "@/lib/utils/errors";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const { ipTruncated } = await getRequestMetadata();
    const limiter = getRateLimiter();
    const rl = await limiter.consume(`login:${ipTruncated ?? "unknown"}`, 20, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const body = await parseJsonBody(request, loginSchema);
    const normalizedEmail = body.email.trim().toLowerCase();

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
        displayName: userProfiles.displayName,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    const user = rows[0];

    const genericError = () => new AppError("Correo o contraseña incorrectos.", "INVALID_CREDENTIALS", 401);

    if (!user) {
      await recordSecurityEvent({ kind: "login_failed_unknown_email", severity: "INFO" });
      throw genericError();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await recordSecurityEvent({ kind: "login_blocked_locked", userId: user.id, severity: "WARNING" });
      throw new AppError(
        "La cuenta está bloqueada temporalmente por múltiples intentos fallidos. Intenta más tarde.",
        "ACCOUNT_LOCKED",
        423,
      );
    }

    const validPassword = await verifyPassword(user.passwordHash, body.password);
    if (!validPassword) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
      await db
        .update(users)
        .set({ failedLoginAttempts: attempts, lockedUntil })
        .where(eq(users.id, user.id));
      await recordSecurityEvent({
        kind: "login_failed_bad_password",
        userId: user.id,
        severity: attempts >= MAX_FAILED_ATTEMPTS ? "WARNING" : "INFO",
        details: { attempts },
      });
      throw genericError();
    }

    if (user.status === "PENDING_VERIFICATION") {
      throw new AppError("Verifica tu correo electrónico antes de iniciar sesión.", "EMAIL_NOT_VERIFIED", 403);
    }
    if (user.status === "SUSPENDED" || user.status === "BLOCKED" || user.status === "DELETED") {
      throw new AppError("Esta cuenta no puede iniciar sesión.", "ACCOUNT_UNAVAILABLE", 403);
    }

    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await createSession(user.id);
    await recordAuditEvent({ actorId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id });

    return NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
