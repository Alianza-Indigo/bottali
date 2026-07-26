import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { readConversationContentForAdmin } from "@/lib/admin/conversation-content";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ reason: z.string().min(10).max(500) });

/**
 * §30 exceptional content access. POST (not GET) deliberately: the mandatory reason travels
 * in the body, never a query string, so it never ends up logged in a URL by an intermediate
 * proxy or browser history.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("conversations.content.read");
    const { id } = await params;
    const { reason } = await parseJsonBody(request, schema);
    const result = await readConversationContentForAdmin({ conversationId: id, adminId: admin.id, reason });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
