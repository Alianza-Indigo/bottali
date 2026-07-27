import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { requestToolAccess } from "@/lib/tools/access";
import { recordAuditEvent } from "@/lib/audit/log";
import { parseOptionalJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const { reason } = await parseOptionalJsonBody(request, schema);
    await requestToolAccess(id, user.id, reason);
    await recordAuditEvent({ actorId: user.id, action: "catalog.tool.request_access", resourceType: "tool", resourceId: id });
    return NextResponse.json({ message: "Solicitud de acceso enviada." });
  } catch (error) {
    return handleApiError(error);
  }
}
