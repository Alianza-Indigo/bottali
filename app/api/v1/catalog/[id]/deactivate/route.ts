import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deactivateToolForUser } from "@/lib/tools/access";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await deactivateToolForUser(id, user.id, user.organizationId);
    await recordAuditEvent({ actorId: user.id, action: "catalog.tool.deactivate", resourceType: "tool", resourceId: id });
    return NextResponse.json({ message: "Herramienta desactivada." });
  } catch (error) {
    return handleApiError(error);
  }
}
