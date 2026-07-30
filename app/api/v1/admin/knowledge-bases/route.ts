import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { createKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const createSchema = z.object({ toolId: z.string().uuid(), name: z.string().min(1).max(120), description: z.string().max(2000).optional() });

export async function GET(request: Request) {
  try {
    const user = await requireUserWithPermission("knowledge.read");
    const url = new URL(request.url);
    const toolId = url.searchParams.get("toolId") ?? undefined;
    const bases = await listKnowledgeBases(user.organizationId, toolId);
    return NextResponse.json({ knowledgeBases: bases });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const body = await parseJsonBody(request, createSchema);
    const kb = await createKnowledgeBase(body.toolId, body.name, body.description, user.id, user.organizationId);
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
