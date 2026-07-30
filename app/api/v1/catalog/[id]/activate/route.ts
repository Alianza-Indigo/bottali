import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { activateToolForUser } from "@/lib/tools/access";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await activateToolForUser(id, user.id, user.organizationId);
    await recordAuditEvent({ actorId: user.id, action: "catalog.tool.activate", resourceType: "tool", resourceId: id });
    return NextResponse.json({ message: "Herramienta activada." });
  } catch (error) {
    return handleApiError(error);
  }
}
