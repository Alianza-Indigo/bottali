import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

/**
 * The primary cancellation path is the client aborting its fetch to /messages, which
 * propagates to request.signal inside the pipeline (§12 step 27). This endpoint is a
 * defensive cleanup for the rare case where a streaming request's serverless function was
 * killed before it could persist a CANCELLED message — it marks any message left in a
 * non-terminal state (PENDING/STREAMING) as CANCELLED. Idempotent: a no-op when there is
 * nothing to clean up.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const conversationRows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    const conversation = conversationRows[0];
    if (!conversation) throw new NotFoundError("Conversación no encontrada.");
    if (conversation.userId !== user.id) throw new ForbiddenError("No puedes acceder a esta conversación.");

    const stuck = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, id), inArray(messages.status, ["PENDING", "STREAMING"])))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    if (stuck[0]) {
      await db.update(messages).set({ status: "CANCELLED" }).where(eq(messages.id, stuck[0].id));
    }

    return NextResponse.json({ message: "Solicitud de cancelación procesada." });
  } catch (error) {
    return handleApiError(error);
  }
}
