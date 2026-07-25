import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { assignTool } from "@/lib/tools/assignments";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ toolId: z.string().uuid(), decision: z.enum(["ALLOW", "DENY"]).default("ALLOW") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("tools.assign");
    const { id } = await params;
    const { toolId, decision } = await parseJsonBody(request, schema);
    await assignTool(toolId, "USER", id, decision, admin.id);
    return NextResponse.json({ message: "Herramienta asignada al usuario." });
  } catch (error) {
    return handleApiError(error);
  }
}
