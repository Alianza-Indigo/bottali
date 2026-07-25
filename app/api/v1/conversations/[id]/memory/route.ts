import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { clearConversationMemory } from "@/lib/conversations/service";
import { handleApiError } from "@/lib/validation/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await clearConversationMemory(id, user.id);
    return NextResponse.json({ message: "Memoria de la conversación eliminada." });
  } catch (error) {
    return handleApiError(error);
  }
}
