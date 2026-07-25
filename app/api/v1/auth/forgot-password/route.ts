import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { generateOpaqueToken, hashToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { getEmailProvider } from "@/lib/notifications/email";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getRequestMetadata } from "@/lib/auth/session";
import { RateLimitError } from "@/lib/utils/errors";

const GENERIC_RESPONSE = { message: "Si el correo existe, recibirás instrucciones para restablecer tu contraseña." };

export async function POST(request: Request) {
  try {
    const { ipTruncated } = await getRequestMetadata();
    const rl = await getRateLimiter().consume(`forgot-password:${ipTruncated ?? "unknown"}`, 5, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const { email } = await parseJsonBody(request, forgotPasswordSchema);
    const normalizedEmail = email.trim().toLowerCase();

    const rows = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    const user = rows[0];

    if (user && user.status !== "DELETED" && user.status !== "BLOCKED") {
      const env = getEnv();
      const token = generateOpaqueToken();
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000),
        requestIp: ipTruncated ?? undefined,
      });
      const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
      await getEmailProvider().send({
        to: normalizedEmail,
        subject: "Restablece tu contraseña",
        text: `Solicitud de restablecimiento de contraseña. Visita: ${resetUrl}\n\nSi no solicitaste esto, ignora este mensaje.`,
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    return handleApiError(error);
  }
}
