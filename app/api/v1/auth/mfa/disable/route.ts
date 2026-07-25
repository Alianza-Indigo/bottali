import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mfaCredentials } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    await db.delete(mfaCredentials).where(eq(mfaCredentials.userId, user.id));
    await recordAuditEvent({ actorId: user.id, action: "auth.mfa.disable", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ message: "MFA desactivado." });
  } catch (error) {
    return handleApiError(error);
  }
}
