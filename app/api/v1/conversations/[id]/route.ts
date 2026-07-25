import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deleteConversation, getConversationWithMessages, renameConversation } from "@/lib/conversations/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const patchSchema = z.object({ title: z.string().min(1).max(200) });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const result = await getConversationWithMessages(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const { title } = await parseJsonBody(request, patchSchema);
    await renameConversation(id, user.id, title);
    return NextResponse.json({ message: "Conversación renombrada." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await deleteConversation(id, user.id);
    return NextResponse.json({ message: "Conversación eliminada." });
  } catch (error) {
    return handleApiError(error);
  }
}
