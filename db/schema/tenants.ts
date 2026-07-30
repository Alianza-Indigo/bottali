import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("ACTIVE"),
    logoUrl: text("logo_url"),
    iconUrl: text("icon_url"),
    primaryColor: varchar("primary_color", { length: 16 }).notNull().default("#0f766e"),
    secondaryColor: varchar("secondary_color", { length: 16 }).notNull().default("#071a23"),
    customDomain: varchar("custom_domain", { length: 255 }),
    googleAllowedDomain: varchar("google_allowed_domain", { length: 255 }),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    uniqueIndex("organizations_custom_domain_idx").on(table.customDomain),
    index("organizations_status_idx").on(table.status),
  ],
);
