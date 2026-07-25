import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversationMemories } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

/** Clears every remembered item for this user across ALL conversations with this tool —
 * broader than DELETE /conversations/{id}/memory, which only clears one conversation's
 * memory (§13: "permitir borrar elementos" / "permitir desactivarse"). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await db.delete(conversationMemories).where(and(eq(conversationMemories.userId, user.id), eq(conversationMemories.toolId, id)));
    await recordAuditEvent({ actorId: user.id, action: "tool.memory.clear_all", resourceType: "tool", resourceId: id });
    return NextResponse.json({ message: "Memoria eliminada para esta herramienta." });
  } catch (error) {
    return handleApiError(error);
  }
}
