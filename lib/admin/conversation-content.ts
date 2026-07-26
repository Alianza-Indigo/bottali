import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages, tools, users } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export interface AdminConversationSummary {
  id: string;
  userId: string;
  userEmail: string;
  toolSlug: string;
  status: string;
  messageCount: number;
  createdAt: Date;
  lastMessageAt: Date | null;
}

/**
 * §30 metadata-only listing — gated by `conversations.metadata.read`, never touches
 * messages.content. Supports an optional userId filter for a per-user drill-down.
 */
export async function listConversationsForAdmin(filters?: { userId?: string }): Promise<AdminConversationSummary[]> {
  const conditions = filters?.userId ? [eq(conversations.userId, filters.userId)] : [];
  const rows = await db
    .select({
      id: conversations.id,
      userId: conversations.userId,
      userEmail: users.email,
      toolSlug: tools.slug,
      status: conversations.status,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
      messageCount: sql<number>`(select count(*)::int from ${messages} where ${messages.conversationId} = ${conversations.id})`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.userId))
    .innerJoin(tools, eq(tools.id, conversations.toolId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  return rows;
}

export async function getConversationSummaryForAdmin(conversationId: string): Promise<AdminConversationSummary> {
  const rows = await listConversationsForAdmin();
  const found = rows.find((r) => r.id === conversationId);
  if (found) return found;
  // Not in the first 200 by recency — look it up directly rather than reporting a false 404.
  const direct = await db
    .select({
      id: conversations.id,
      userId: conversations.userId,
      userEmail: users.email,
      toolSlug: tools.slug,
      status: conversations.status,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
      messageCount: sql<number>`(select count(*)::int from ${messages} where ${messages.conversationId} = ${conversations.id})`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.userId))
    .innerJoin(tools, eq(tools.id, conversations.toolId))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!direct[0]) throw new NotFoundError("Conversación no encontrada.");
  return direct[0];
}

export interface AdminMinimalMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

const MIN_REASON_LENGTH = 10;

/**
 * §30 exceptional content access: reading message *content* (as opposed to metadata) is a
 * separately-gated, rare action — the caller must already hold `conversations.content.read`
 * (checked by the route, never here) and must supply a real reason, which is recorded on the
 * audit event. The returned shape is deliberately minimized: only role/content/timestamp, no
 * cost/token/model/moderation internals and no attachment ids — an admin reviewing content for
 * a support or safety reason doesn't need that operational detail, and every field returned
 * here is a field that could end up on an admin's screen unnecessarily.
 */
export async function readConversationContentForAdmin(params: {
  conversationId: string;
  adminId: string;
  reason: string;
}): Promise<{ conversation: AdminConversationSummary; messages: AdminMinimalMessage[] }> {
  const reason = params.reason.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ValidationError(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres.`);
  }

  const conversation = await getConversationSummaryForAdmin(params.conversationId);

  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, params.conversationId))
    .orderBy(messages.createdAt);

  // Never put message content in audit metadata (lib/audit/log.ts) — only ids/counts, which
  // is enough to reconstruct "who read what, when, and why" without duplicating the content
  // itself into a table the AUDITOR role can read.
  await recordAuditEvent({
    actorId: params.adminId,
    action: "admin.conversation.content_read",
    resourceType: "conversation",
    resourceId: params.conversationId,
    reason,
    metadata: { conversationUserId: conversation.userId, messageCount: rows.length },
  });

  return { conversation, messages: rows };
}
