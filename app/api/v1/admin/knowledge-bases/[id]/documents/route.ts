import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { initiateDocumentUpload } from "@/lib/knowledge/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  language: z.string().max(10).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    const body = await parseJsonBody(request, schema);
    const result = await initiateDocumentUpload({ knowledgeBaseId: id, actorId: user.id, ...body });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
