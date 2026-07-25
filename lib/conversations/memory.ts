import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { consents, conversationMemories } from "@/db/schema";

export type MemoryMode = "DISABLED" | "CONVERSATION_ONLY" | "SESSION_ONLY" | "USER_APPROVED" | "STRUCTURED" | "LONG_TERM";

const MAX_MEMORY_ITEMS_PER_SCOPE = 20;

async function hasMemoryConsent(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.kind, "memory"), eq(consents.granted, true), isNull(consents.revokedAt)))
    .limit(1);
  return rows.length > 0;
}

/**
 * §13: memory is configurable per tool and requires consent for the modes that persist
 * across conversations. This is intentionally a simple recency-window store (most recent
 * user turns, truncated) rather than an LLM-driven fact-extraction pipeline — a real,
 * working baseline that a future iteration can replace without changing the call sites
 * (retrieveMemory / recordMemoryTurn), since both already key off `mode`.
 */
export async function retrieveMemory(params: {
  userId: string;
  toolId: string;
  conversationId: string;
  mode: MemoryMode;
}): Promise<string[]> {
  if (params.mode === "DISABLED") return [];

  if (params.mode === "CONVERSATION_ONLY" || params.mode === "SESSION_ONLY") {
    const rows = await db
      .select({ value: conversationMemories.value })
      .from(conversationMemories)
      .where(eq(conversationMemories.conversationId, params.conversationId))
      .orderBy(desc(conversationMemories.createdAt))
      .limit(MAX_MEMORY_ITEMS_PER_SCOPE);
    return rows.map((r) => r.value);
  }

  // USER_APPROVED / STRUCTURED / LONG_TERM persist across conversations for this user+tool
  // and require an explicit, revocable "memory" consent (§13, §30).
  if (!(await hasMemoryConsent(params.userId))) return [];

  const rows = await db
    .select({ value: conversationMemories.value })
    .from(conversationMemories)
    .where(and(eq(conversationMemories.userId, params.userId), eq(conversationMemories.toolId, params.toolId)))
    .orderBy(desc(conversationMemories.createdAt))
    .limit(MAX_MEMORY_ITEMS_PER_SCOPE);
  return rows.map((r) => r.value);
}

export async function recordMemoryTurn(params: {
  userId: string;
  toolId: string;
  conversationId: string;
  mode: MemoryMode;
  userMessage: string;
}): Promise<void> {
  if (params.mode === "DISABLED") return;
  if (params.mode !== "CONVERSATION_ONLY" && params.mode !== "SESSION_ONLY") {
    if (!(await hasMemoryConsent(params.userId))) return;
  }

  await db.insert(conversationMemories).values({
    userId: params.userId,
    toolId: params.toolId,
    conversationId: params.conversationId,
    mode: params.mode,
    key: `turn:${Date.now()}`,
    value: params.userMessage.slice(0, 500),
    source: "user_message",
  });
}
