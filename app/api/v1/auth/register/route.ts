import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  legalAcceptances,
  legalDocuments,
  userProfiles,
  userRoles,
  users,
} from "@/db/schema";
import { registerSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { hashPassword, evaluatePasswordStrength } from "@/lib/auth/password";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getRequestMetadata } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";
import { getRoleIdsByKeys } from "@/lib/permissions/rbac";
import { ValidationError, RateLimitError } from "@/lib/utils/errors";

const GENERIC_RESPONSE = {
  message: "Cuenta creada. Ya puedes iniciar sesión.",
};

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
      return NextResponse.json(GENERIC_RESPONSE, { status: 201 });
    }

    const passwordHash = await hashPassword(body.password);

    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!user) return null;

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

    if (!userId) {
      await recordAuditEvent({
        action: "auth.register.duplicate",
        resourceType: "user",
        result: "FAILURE",
      });
      return NextResponse.json(GENERIC_RESPONSE, { status: 201 });
    }

    await recordAuditEvent({
      actorId: userId,
      action: "auth.register",
      resourceType: "user",
      resourceId: userId,
    });

    return NextResponse.json(GENERIC_RESPONSE, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
