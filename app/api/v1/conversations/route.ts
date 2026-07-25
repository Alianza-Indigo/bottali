import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canUserAccessTool } from "@/lib/tools/access";
import { getToolById } from "@/lib/tools/repository";
import { createConversation, listConversations } from "@/lib/conversations/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ForbiddenError } from "@/lib/utils/errors";

const createSchema = z.object({ toolId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const toolId = url.searchParams.get("toolId") ?? undefined;
    const status = url.searchParams.get("status") as "ACTIVE" | "ARCHIVED" | null;
    const conversations = await listConversations(user.id, { toolId, status: status ?? undefined });
    return NextResponse.json({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { toolId } = await parseJsonBody(request, createSchema);

    const tool = await getToolById(toolId);
    if (tool.status !== "PUBLISHED" || !tool.publishedVersionId) {
      throw new ForbiddenError("Esta herramienta no está disponible.");
    }
    if (!(await canUserAccessTool(toolId, user.id))) {
      throw new ForbiddenError("No tienes acceso a esta herramienta.");
    }

    const conversation = await createConversation(user.id, toolId, tool.publishedVersionId);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
