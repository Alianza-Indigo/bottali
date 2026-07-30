import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import { suspendTool } from "@/lib/tools/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ reason: z.string().min(1).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.suspend");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    const { reason } = await parseJsonBody(request, schema);
    await suspendTool(id, user.id, reason);
    return NextResponse.json({ message: "Herramienta suspendida." });
  } catch (error) {
    return handleApiError(error);
  }
}
