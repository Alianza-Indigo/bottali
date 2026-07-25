import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { archiveTool } from "@/lib/tools/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.archive");
    const { id } = await params;
    const { reason } = await parseJsonBody(request, schema).catch(() => ({ reason: undefined }));
    await archiveTool(id, user.id, reason);
    return NextResponse.json({ message: "Herramienta archivada." });
  } catch (error) {
    return handleApiError(error);
  }
}
