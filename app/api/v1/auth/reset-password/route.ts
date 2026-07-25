import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword, evaluatePasswordStrength } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { recordAuditEvent, recordSecurityEvent } from "@/lib/audit/log";
import { AppError, ValidationError } from "@/lib/utils/errors";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, resetPasswordSchema);
    const strength = evaluatePasswordStrength(body.password);
    if (!strength.valid) {
      throw new ValidationError("La contraseña no cumple los requisitos mínimos.", strength.reasons);
    }

    const tokenHash = hashToken(body.token);
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.consumedAt)))
      .limit(1);

    const record = rows[0];
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new AppError("El enlace de restablecimiento es inválido o expiró.", "INVALID_TOKEN", 400);
    }

    const passwordHash = await hashPassword(body.password);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, record.userId));
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));
    });

    // A password reset is a strong signal to invalidate every existing session.
    await revokeAllUserSessions(record.userId);

    await recordAuditEvent({
      actorId: record.userId,
      action: "auth.reset_password",
      resourceType: "user",
      resourceId: record.userId,
    });
    await recordSecurityEvent({ kind: "password_reset_completed", userId: record.userId, severity: "INFO" });

    return NextResponse.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (error) {
    return handleApiError(error);
  }
}
