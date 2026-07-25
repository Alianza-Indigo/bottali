import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailVerificationTokens, users } from "@/db/schema";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { generateOpaqueToken, hashToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { getEmailProvider } from "@/lib/notifications/email";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getRequestMetadata } from "@/lib/auth/session";
import { RateLimitError } from "@/lib/utils/errors";

const GENERIC_RESPONSE = { message: "Si la cuenta existe y no ha sido verificada, se envió un nuevo enlace." };

export async function POST(request: Request) {
  try {
    const { ipTruncated } = await getRequestMetadata();
    const rl = await getRateLimiter().consume(`resend-verification:${ipTruncated ?? "unknown"}`, 3, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const { email } = await parseJsonBody(request, resendVerificationSchema);
    const normalizedEmail = email.trim().toLowerCase();

    const rows = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    const user = rows[0];

    if (user && user.status === "PENDING_VERIFICATION") {
      const env = getEnv();
      const token = generateOpaqueToken();
      await db.insert(emailVerificationTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_SECONDS * 1000),
      });
      const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
      await getEmailProvider().send({
        to: normalizedEmail,
        subject: "Verifica tu cuenta",
        text: `Confirma tu correo visitando: ${verifyUrl}`,
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    return handleApiError(error);
  }
}
