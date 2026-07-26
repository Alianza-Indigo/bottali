import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tools, toolVersions } from "./tools";
import { usageReservations } from "./usage";
import {
  conversationStatusEnum,
  memoryModeEnum,
  messageRoleEnum,
  messageStatusEnum,
  toolCallConfirmationStatusEnum,
} from "./enums";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    toolVersionId: uuid("tool_version_id")
      .notNull()
      .references(() => toolVersions.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull().default("Nueva conversación"),
    status: conversationStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("conversations_user_idx").on(table.userId),
    index("conversations_tool_idx").on(table.toolId),
    index("conversations_status_idx").on(table.status),
    index("conversations_user_status_idx").on(table.userId, table.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull().default(""),
    contentType: varchar("content_type", { length: 24 }).notNull().default("text"),
    status: messageStatusEnum("status").notNull().default("COMPLETED"),
    provider: varchar("provider", { length: 64 }),
    model: varchar("model", { length: 120 }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostCents: numeric("estimated_cost_cents", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    latencyMs: integer("latency_ms"),
    finishReason: varchar("finish_reason", { length: 32 }),
    moderationResult: jsonb("moderation_result").$type<Record<string, unknown> | null>(),
    citations: jsonb("citations").$type<Array<{ documentId: string; chunkId: string; title: string }>>()
      .notNull()
      .default([]),
    attachedFileIds: jsonb("attached_file_ids").$type<string[]>().notNull().default([]),
    generatedFileIds: jsonb("generated_file_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  ],
);

export const messageFeedback = pgTable(
  "message_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: varchar("rating", { length: 8 }).notNull(), // up | down
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("message_feedback_message_idx").on(table.messageId)],
);

export const conversationMemories = pgTable(
  "conversation_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    mode: memoryModeEnum("mode").notNull().default("DISABLED"),
    key: varchar("key", { length: 120 }).notNull(),
    value: text("value").notNull(),
    source: varchar("source", { length: 40 }).notNull().default("assistant"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("conversation_memories_user_tool_idx").on(table.userId, table.toolId),
  ],
);

/**
 * §15 human-in-the-loop tools: a model-requested call to a tool with requiresConfirmation
 * (or explicitly listed in safetyPolicies.confirmationsRequired) pauses the round loop
 * instead of auto-executing. generationStateSnapshot carries everything the loop needs to
 * resume exactly where it paused — re-deriving it from persisted conversation messages
 * would lose the in-flight assistant tool-call/tool-result messages, which are never
 * persisted to `messages` (only the final visible reply is).
 */
export const toolCallConfirmations = pgTable(
  "tool_call_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => usageReservations.id, { onDelete: "cascade" }),
    toolCallId: varchar("tool_call_id", { length: 128 }).notNull(),
    toolName: varchar("tool_name", { length: 80 }).notNull(),
    argumentsJson: text("arguments_json").notNull(),
    status: toolCallConfirmationStatusEnum("status").notNull().default("PENDING"),
    // Nullable deliberately: it holds a full generation snapshot (system prompt, turn
    // history, tool results) that's only needed to resume a PENDING confirmation. Once one
    // reaches a terminal state (APPROVED/REJECTED/EXPIRED) it's never read again, so it's
    // cleared rather than left to persist sensitive conversation content indefinitely.
    generationStateSnapshot: jsonb("generation_state_snapshot").$type<{
      generationMessages: Array<{ role: string; content: string; toolCalls?: unknown; toolCallId?: string }>;
      round: number;
      accumulatedUsage: { inputTokens: number; outputTokens: number };
      accumulatedLatencyMs: number;
      userMessageContent: string;
      /** Tool calls from the same round as the paused one, not yet processed — the paused
       * call itself is NOT included (it's the top-level toolCallId/toolName/argumentsJson). */
      remainingCalls: Array<{ id: string; name: string; arguments: string }>;
      /** Documents produced by generate_text_document calls earlier in this same turn,
       * carried across the pause so they're still persisted once the turn finally finishes
       * (a turn can call the tool, then hit a confirmation-requiring tool, then resume). */
      generatedDocuments: Array<{ title: string; text: string; mimeType: string }>;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("tool_call_confirmations_conversation_idx").on(table.conversationId),
    index("tool_call_confirmations_status_idx").on(table.status),
    index("tool_call_confirmations_expires_idx").on(table.expiresAt),
  ],
);
