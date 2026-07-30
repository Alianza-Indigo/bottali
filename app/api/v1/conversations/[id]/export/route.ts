import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { exportConversation } from "@/lib/conversations/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const data = await exportConversation(id, user.id, user.organizationId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
