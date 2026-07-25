import { boolean, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: varchar("kind", { length: 24 }).notNull(), // llm | embedding | stt | tts | moderation
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  configuredViaEnv: boolean("configured_via_env").notNull().default(true),
  lastHealthcheckAt: timestamp("last_healthcheck_at", { withTimezone: true }),
  lastHealthcheckStatus: varchar("last_healthcheck_status", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerModels = pgTable(
  "provider_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelKey: varchar("model_key", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    contextWindow: integer("context_window").notNull().default(8000),
    inputCostPerMilleCents: numeric("input_cost_per_mille_cents", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    outputCostPerMilleCents: numeric("output_cost_per_mille_cents", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    available: boolean("available").notNull().default(true),
    isFallbackCandidate: boolean("is_fallback_candidate").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("provider_models_provider_key_idx").on(table.providerId, table.modelKey),
  ],
);
