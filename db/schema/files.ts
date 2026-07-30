import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tools } from "./tools";
import { conversations, messages } from "./conversations";
import { fileStatusEnum } from "./enums";
import { organizations } from "./tenants";

export const uploadedFiles = pgTable(
  "uploaded_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    blobKey: varchar("blob_key", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    status: fileStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("uploaded_files_user_idx").on(table.userId),
    index("uploaded_files_organization_idx").on(table.organizationId),
    index("uploaded_files_conversation_idx").on(table.conversationId),
  ],
);

export const generatedFiles = pgTable(
  "generated_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    blobKey: varchar("blob_key", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("generated_files_user_idx").on(table.userId),
    index("generated_files_organization_idx").on(table.organizationId),
  ],
);
