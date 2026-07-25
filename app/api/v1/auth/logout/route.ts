import { NextResponse } from "next/server";
import { destroyCurrentSession, getCurrentSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST() {
  try {
    const session = await getCurrentSession();
    await destroyCurrentSession();
    if (session) {
      await recordAuditEvent({ actorId: session.id, action: "auth.logout", resourceType: "user", resourceId: session.id });
    }
    return NextResponse.json({ message: "Sesión cerrada." });
  } catch (error) {
    return handleApiError(error);
  }
}
