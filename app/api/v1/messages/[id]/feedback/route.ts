import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messageFeedback, messages } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

const schema = z.object({ rating: z.enum(["up", "down"]), comment: z.string().max(1000).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const { rating, comment } = await parseJsonBody(request, schema);

    const rows = await db
      .select({ conversationUserId: conversations.userId })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(messages.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mensaje no encontrado.");
    if (row.conversationUserId !== user.id) throw new ForbiddenError("No puedes calificar este mensaje.");

    await db.insert(messageFeedback).values({ messageId: id, userId: user.id, rating, comment });
    return NextResponse.json({ message: "Gracias por tu retroalimentación." }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
