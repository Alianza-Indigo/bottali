import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailVerificationTokens, users } from "@/db/schema";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { hashToken } from "@/lib/auth/tokens";
import { recordAuditEvent } from "@/lib/audit/log";
import { AppError } from "@/lib/utils/errors";

export async function POST(request: Request) {
  try {
    const { token } = await parseJsonBody(request, verifyEmailSchema);
    const tokenHash = hashToken(token);

    const rows = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.tokenHash, tokenHash), isNull(emailVerificationTokens.consumedAt)))
      .limit(1);

    const record = rows[0];
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new AppError("El enlace de verificación es inválido o expiró.", "INVALID_TOKEN", 400);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "ACTIVE", emailVerifiedAt: new Date() })
        .where(eq(users.id, record.userId));
      await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationTokens.id, record.id));
    });

    await recordAuditEvent({
      actorId: record.userId,
      action: "auth.verify_email",
      resourceType: "user",
      resourceId: record.userId,
    });

    return NextResponse.json({ message: "Correo verificado correctamente." });
  } catch (error) {
    return handleApiError(error);
  }
}
