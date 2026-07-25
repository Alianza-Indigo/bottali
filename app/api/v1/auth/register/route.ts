import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailVerificationTokens, userProfiles, userRoles, users } from "@/db/schema";
import { registerSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { hashPassword, evaluatePasswordStrength } from "@/lib/auth/password";
import { generateOpaqueToken, hashToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getRequestMetadata } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";
import { getEmailProvider } from "@/lib/notifications/email";
import { getRoleIdsByKeys } from "@/lib/permissions/rbac";
import { ValidationError, RateLimitError } from "@/lib/utils/errors";

export async function POST(request: Request) {
  try {
    const { ipTruncated } = await getRequestMetadata();
    const limiter = getRateLimiter();
    const rl = await limiter.consume(`register:${ipTruncated ?? "unknown"}`, 5, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const body = await parseJsonBody(request, registerSchema);
    const strength = evaluatePasswordStrength(body.password);
    if (!strength.valid) {
      throw new ValidationError("La contraseña no cumple los requisitos mínimos.", strength.reasons);
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      // Do not reveal which emails exist. Behave identically to the success path.
      await recordAuditEvent({
        action: "auth.register.duplicate",
        resourceType: "user",
        result: "FAILURE",
      });
      return NextResponse.json(
        { message: "Si el correo es válido, recibirás instrucciones para verificar tu cuenta." },
        { status: 201 },
      );
    }

    const passwordHash = await hashPassword(body.password);
    const env = getEnv();

    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, status: "PENDING_VERIFICATION" })
        .returning({ id: users.id });
      if (!user) throw new Error("No fue posible crear el usuario.");

      await tx.insert(userProfiles).values({ userId: user.id, displayName: body.displayName });

      const roleMap = await getRoleIdsByKeys(["USER"]);
      const userRoleId = roleMap.get("USER");
      if (userRoleId) {
        await tx.insert(userRoles).values({ userId: user.id, roleId: userRoleId });
      }

      return user.id;
    });

    const token = generateOpaqueToken();
    await db.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashToken(token),
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_SECONDS * 1000),
    });

    const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
    await getEmailProvider().send({
      to: normalizedEmail,
      subject: "Verifica tu cuenta",
      text: `Confirma tu correo visitando: ${verifyUrl}\n\nEste enlace expira en ${Math.round(env.EMAIL_VERIFICATION_TTL_SECONDS / 3600)} horas.`,
    });

    await recordAuditEvent({
      actorId: userId,
      action: "auth.register",
      resourceType: "user",
      resourceId: userId,
    });

    return NextResponse.json(
      { message: "Si el correo es válido, recibirás instrucciones para verificar tu cuenta." },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
