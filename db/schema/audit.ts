import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    resourceType: varchar("resource_type", { length: 60 }).notNull(),
    resourceId: varchar("resource_id", { length: 80 }),
    result: varchar("result", { length: 16 }).notNull().default("SUCCESS"),
    reason: text("reason"),
    ipTruncated: varchar("ip_truncated", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    correlationId: varchar("correlation_id", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorId),
    index("audit_events_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 60 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("INFO"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipTruncated: varchar("ip_truncated", { length: 64 }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("security_events_kind_idx").on(table.kind), index("security_events_created_idx").on(table.createdAt)],
);
