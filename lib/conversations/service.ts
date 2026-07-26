import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversationMemories, conversations, messages } from "@/db/schema";
import { NotFoundError, ForbiddenError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export async function createConversation(userId: string, toolId: string, toolVersionId: string) {
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, toolId, toolVersionId })
    .returning();
  if (!conversation) throw new Error("No fue posible crear la conversación.");
  return conversation;
}

async function getOwnedConversation(conversationId: string, userId: string) {
  const rows = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const conversation = rows[0];
  if (!conversation || conversation.deletedAt) throw new NotFoundError("Conversación no encontrada.");
  if (conversation.userId !== userId) throw new ForbiddenError("No puedes acceder a esta conversación.");
  return conversation;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** §46 "implementa paginación": bounded and offset-based rather than an unbounded SELECT —
 * a user with thousands of conversations must not force a single query to return them all. */
export async function listConversations(
  userId: string,
  options: { toolId?: string; status?: "ACTIVE" | "ARCHIVED"; limit?: number; offset?: number } = {},
) {
  const filters = [eq(conversations.userId, userId), isNull(conversations.deletedAt)];
  if (options.toolId) filters.push(eq(conversations.toolId, options.toolId));
  if (options.status) filters.push(eq(conversations.status, options.status));
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(options.offset ?? 0, 0);
  return db
    .select()
    .from(conversations)
    .where(and(...filters))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);
}

export async function getConversationWithMessages(conversationId: string, userId: string) {
  const conversation = await getOwnedConversation(conversationId, userId);
  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  return { conversation, messages: rows };
}

export async function renameConversation(conversationId: string, userId: string, title: string) {
  await getOwnedConversation(conversationId, userId);
  await db.update(conversations).set({ title, updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function archiveConversation(conversationId: string, userId: string) {
  await getOwnedConversation(conversationId, userId);
  await db.update(conversations).set({ status: "ARCHIVED", archivedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function restoreConversation(conversationId: string, userId: string) {
  await getOwnedConversation(conversationId, userId);
  await db.update(conversations).set({ status: "ACTIVE", archivedAt: null }).where(eq(conversations.id, conversationId));
}

/** Logical delete only — content stays available for the retention/audit window and is
 * purged by the retention cron, never mutated in place by a user action. */
export async function deleteConversation(conversationId: string, userId: string) {
  await getOwnedConversation(conversationId, userId);
  await db.update(conversations).set({ status: "DELETED", deletedAt: new Date() }).where(eq(conversations.id, conversationId));
  await recordAuditEvent({ actorId: userId, action: "conversation.delete", resourceType: "conversation", resourceId: conversationId });
}

export async function clearConversationMemory(conversationId: string, userId: string) {
  await getOwnedConversation(conversationId, userId);
  await db.delete(conversationMemories).where(eq(conversationMemories.conversationId, conversationId));
}

export async function exportConversation(conversationId: string, userId: string) {
  const { conversation, messages: rows } = await getConversationWithMessages(conversationId, userId);
  await recordAuditEvent({ actorId: userId, action: "conversation.export", resourceType: "conversation", resourceId: conversationId });
  return {
    conversation: { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt },
    messages: rows.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
  };
}

/** Auto-titles a conversation from its first exchange — never overwrites a title the
 * user has already set explicitly (tracked implicitly: only fires while title is still
 * the default placeholder). */
export async function maybeGenerateTitle(conversationId: string, firstUserMessage: string): Promise<void> {
  const rows = await db.select({ title: conversations.title }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (rows[0]?.title !== "Nueva conversación") return;
  const title = firstUserMessage.trim().slice(0, 60) || "Nueva conversación";
  await db.update(conversations).set({ title }).where(eq(conversations.id, conversationId));
}
