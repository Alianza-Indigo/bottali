import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mfaCredentials } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { generateBase32Secret, buildOtpAuthUrl } from "@/lib/auth/totp";
import { encryptSecret } from "@/lib/security/crypto";
import { handleApiError } from "@/lib/validation/http";

export async function POST() {
  try {
    const user = await requireCurrentUser();

    // Remove any previous unconfirmed setup attempt before creating a new one.
    await db.delete(mfaCredentials).where(eq(mfaCredentials.userId, user.id));

    const secret = generateBase32Secret();
    await db.insert(mfaCredentials).values({
      userId: user.id,
      secretEncrypted: encryptSecret(secret),
    });

    const otpauthUrl = buildOtpAuthUrl({ secret, email: user.email, issuer: "Crisis Platform" });

    return NextResponse.json({ secret, otpauthUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
