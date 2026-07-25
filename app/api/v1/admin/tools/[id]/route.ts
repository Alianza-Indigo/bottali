import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolById, loadVersionConfig } from "@/lib/tools/repository";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";

const updateToolSchema = z.object({
  responsibleUserId: z.string().uuid().optional(),
  team: z.string().max(120).optional(),
  category: z.string().max(64).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.read");
    const { id } = await params;
    const tool = await getToolById(id);
    const editableVersionId = tool.draftVersionId ?? tool.publishedVersionId;
    const config = editableVersionId ? await loadVersionConfig(editableVersionId) : null;
    return NextResponse.json({ tool, editableVersionId, config });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.update");
    const { id } = await params;
    const body = await parseJsonBody(request, updateToolSchema);
    await getToolById(id);
    await db.update(tools).set({ ...body, updatedAt: new Date() }).where(eq(tools.id, id));
    await recordAuditEvent({ actorId: user.id, action: "tool.update.metadata", resourceType: "tool", resourceId: id });
    return NextResponse.json({ message: "Herramienta actualizada." });
  } catch (error) {
    return handleApiError(error);
  }
}
