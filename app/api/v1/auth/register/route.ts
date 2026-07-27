import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { legalAcceptances, legalDocuments, userProfiles, userRoles, users } from "@/db/schema";
import { registerSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { hashPassword, evaluatePasswordStrength } from "@/lib/auth/password";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getRequestMetadata } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";
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

    // TEMPORAL: verificación de correo desactivada a petición explícita — las cuentas se
    // crean directamente ACTIVE en vez de PENDING_VERIFICATION, sin token ni correo de
    // verificación. Para reactivarla: volver a status: "PENDING_VERIFICATION" (sin
    // emailVerifiedAt) y restaurar el bloque que crea el emailVerificationTokens y envía el
    // correo (ver git history de este archivo), y ajustar el mensaje de éxito de vuelta.
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() })
        .returning({ id: users.id });
      if (!user) throw new Error("No fue posible crear el usuario.");

      await tx.insert(userProfiles).values({ userId: user.id, displayName: body.displayName });

      const roleMap = await getRoleIdsByKeys(["USER"]);
      const userRoleId = roleMap.get("USER");
      if (userRoleId) {
        await tx.insert(userRoles).values({ userId: user.id, roleId: userRoleId });
      }

      // registerSchema already requires acceptedPrivacyPolicy: true (validated above), but
      // that alone was never recorded anywhere — legalAcceptances existed in the schema
      // with no writer. Record it against whichever privacy_policy is published right now,
      // so a later policy version bump is distinguishable from what this user actually saw.
      const [currentPolicy] = await tx
        .select({ id: legalDocuments.id })
        .from(legalDocuments)
        .where(eq(legalDocuments.kind, "privacy_policy"))
        .limit(1);
      if (currentPolicy) {
        await tx.insert(legalAcceptances).values({ userId: user.id, legalDocumentId: currentPolicy.id });
      }

      return user.id;
    });

    await recordAuditEvent({
      actorId: userId,
      action: "auth.register",
      resourceType: "user",
      resourceId: userId,
    });

    return NextResponse.json({ message: "Cuenta creada. Ya puedes iniciar sesión." }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
