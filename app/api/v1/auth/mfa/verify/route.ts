import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mfaCredentials } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { verifyTotpCode, generateRecoveryCodes } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/security/crypto";
import { hashToken } from "@/lib/auth/tokens";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";
import { AppError } from "@/lib/utils/errors";

const schema = z.object({ code: z.string().length(6) });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { code } = await parseJsonBody(request, schema);

    const rows = await db.select().from(mfaCredentials).where(eq(mfaCredentials.userId, user.id)).limit(1);
    const credential = rows[0];
    if (!credential) {
      throw new AppError("No hay una configuración de MFA pendiente.", "MFA_NOT_SETUP", 400);
    }

    const secret = decryptSecret(credential.secretEncrypted);
    if (!verifyTotpCode(secret, code)) {
      throw new AppError("El código ingresado no es válido.", "INVALID_MFA_CODE", 400);
    }

    const recoveryCodes = generateRecoveryCodes();
    await db
      .update(mfaCredentials)
      .set({ enabledAt: new Date(), recoveryCodesHash: recoveryCodes.map(hashToken) })
      .where(eq(mfaCredentials.id, credential.id));

    await recordAuditEvent({ actorId: user.id, action: "auth.mfa.enable", resourceType: "user", resourceId: user.id });

    return NextResponse.json({ message: "MFA activado.", recoveryCodes });
  } catch (error) {
    return handleApiError(error);
  }
}
