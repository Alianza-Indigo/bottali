import { boolean, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 80 }).primaryKey(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
