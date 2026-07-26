import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getConversationSummaryForAdmin } from "@/lib/admin/conversation-content";
import { handleApiError } from "@/lib/validation/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("conversations.metadata.read");
    const { id } = await params;
    const conversation = await getConversationSummaryForAdmin(id);
    return NextResponse.json({ conversation });
  } catch (error) {
    return handleApiError(error);
  }
}
