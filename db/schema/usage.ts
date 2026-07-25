import { index, integer, jsonb, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tools } from "./tools";
import { conversations, messages } from "./conversations";
import { groups } from "./rbac";

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 32 }).notNull(), // message | embedding | job | audio
    provider: varchar("provider", { length: 64 }),
    model: varchar("model", { length: 120 }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costCents: numeric("cost_cents", { precision: 10, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_events_user_idx").on(table.userId),
    index("usage_events_tool_idx").on(table.toolId),
    index("usage_events_created_idx").on(table.createdAt),
  ],
);

// Reservation is created before generation starts (estimated cost) and reconciled
// (or released) right after — this is what prevents double-charging on retries and
// keeps a hard budget ceiling meaningful under concurrent requests.
export const usageReservations = pgTable(
  "usage_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    estimatedCostCents: numeric("estimated_cost_cents", { precision: 10, scale: 4 }).notNull(),
    reconciledCostCents: numeric("reconciled_cost_cents", { precision: 10, scale: 4 }),
    status: varchar("status", { length: 16 }).notNull().default("HELD"), // HELD | RECONCILED | RELEASED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("usage_reservations_idempotency_idx").on(table.idempotencyKey),
    index("usage_reservations_user_idx").on(table.userId),
  ],
);

export const usageLimits = pgTable(
  "usage_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 16 }).notNull(), // user | tool | group | provider | model
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    dailyMessageLimit: integer("daily_message_limit"),
    monthlyTokenLimit: integer("monthly_token_limit"),
    monthlyCostLimitCents: integer("monthly_cost_limit_cents"),
    conversationLimit: integer("conversation_limit"),
    fileLimit: integer("file_limit"),
    storageLimitBytes: integer("storage_limit_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_limits_scope_idx").on(table.scope)],
);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
  periodMonthlyCents: integer("period_monthly_cents").notNull(),
  alertThresholdPercent: integer("alert_threshold_percent").notNull().default(80),
  hardStop: integer("hard_stop").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    source: varchar("source", { length: 32 }).notNull(),
    amountCents: numeric("amount_cents", { precision: 10, scale: 4 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cost_events_tool_idx").on(table.toolId), index("cost_events_created_idx").on(table.createdAt)],
);
