import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { listConversationsForAdmin } from "@/lib/admin/conversation-content";
import { handleApiError } from "@/lib/validation/http";

export async function GET(request: Request) {
  try {
    await requireUserWithPermission("conversations.metadata.read");
    const userId = new URL(request.url).searchParams.get("userId") ?? undefined;
    const conversations = await listConversationsForAdmin(userId ? { userId } : undefined);
    return NextResponse.json({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}
