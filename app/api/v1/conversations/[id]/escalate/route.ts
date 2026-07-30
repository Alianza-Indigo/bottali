import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { escalateConversation } from "@/lib/conversations/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await escalateConversation(id, user.id, user.organizationId);
    return NextResponse.json({ message: "Conversación escalada a revisión humana." });
  } catch (error) {
    return handleApiError(error);
  }
}
