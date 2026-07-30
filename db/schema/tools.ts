import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { groups, roles } from "./rbac";
import {
  accessModeEnum,
  evaluationStatusOnVersionEnum,
  memoryModeEnum,
  toolStatusEnum,
  toolVersionStatusEnum,
} from "./enums";
import { providerModels, providers } from "./providers";

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    category: varchar("category", { length: 64 }),
    responsibleUserId: uuid("responsible_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    team: varchar("team", { length: 120 }),
    status: toolStatusEnum("status").notNull().default("DRAFT"),
    publishedVersionId: uuid("published_version_id"),
    draftVersionId: uuid("draft_version_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tools_slug_idx").on(table.slug),
    index("tools_status_idx").on(table.status),
  ],
);

export const toolVersions = pgTable(
  "tool_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: toolVersionStatusEnum("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    changeSummary: text("change_summary"),
    configurationSnapshot: jsonb("configuration_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    promptHash: varchar("prompt_hash", { length: 128 }),
    knowledgeRevision: integer("knowledge_revision").notNull().default(0),
    evaluationStatus: evaluationStatusOnVersionEnum("evaluation_status").notNull().default("NOT_RUN"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tool_versions_tool_version_idx").on(table.toolId, table.versionNumber),
    index("tool_versions_status_idx").on(table.status),
  ],
);

export const toolBranding = pgTable("tool_branding", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  shortName: varchar("short_name", { length: 40 }).notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  fullDescription: text("full_description"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  targetAudience: varchar("target_audience", { length: 200 }),
  iconUrl: text("icon_url"),
  logoUrl: text("logo_url"),
  coverImageUrl: text("cover_image_url"),
  primaryColor: varchar("primary_color", { length: 16 }).notNull().default("#1d4ed8"),
  secondaryColor: varchar("secondary_color", { length: 16 }).notNull().default("#0f172a"),
  theme: varchar("theme", { length: 16 }).notNull().default("system"),
});

export const toolBehavior = pgTable("tool_behavior", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  systemPrompt: text("system_prompt").notNull(),
  additionalInstructions: text("additional_instructions"),
  tone: varchar("tone", { length: 64 }),
  personality: text("personality"),
  language: varchar("language", { length: 10 }).notNull().default("es"),
  welcomeMessage: text("welcome_message").notNull(),
  suggestedQuestions: jsonb("suggested_questions").$type<string[]>().notNull().default([]),
  errorMessage: text("error_message").notNull().default(
    "No fue posible generar una respuesta. Intenta nuevamente.",
  ),
  closingMessage: text("closing_message"),
  scopeNotice: text("scope_notice").notNull(),
  limitations: text("limitations"),
  rules: jsonb("rules").$type<string[]>().notNull().default([]),
  additionalContext: text("additional_context"),
  allowedProfileFields: jsonb("allowed_profile_fields").$type<string[]>().notNull().default([]),
  exampleExchanges: jsonb("example_exchanges")
    .$type<Array<{ user: string; assistant: string }>>()
    .notNull()
    .default([]),
  memoryMode: memoryModeEnum("memory_mode").notNull().default("DISABLED"),
});

export const toolModels = pgTable("tool_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
  primaryModelId: uuid("primary_model_id").references(() => providerModels.id, {
    onDelete: "set null",
  }),
  fallbackModelId: uuid("fallback_model_id").references(() => providerModels.id, {
    onDelete: "set null",
  }),
  temperature: numeric("temperature", { precision: 3, scale: 2 }).notNull().default("0.70"),
  topP: numeric("top_p", { precision: 3, scale: 2 }).notNull().default("1.00"),
  maxOutputTokens: integer("max_output_tokens").notNull().default(1024),
  timeoutMs: integer("timeout_ms").notNull().default(30000),
  maxRetries: integer("max_retries").notNull().default(2),
  streamingEnabled: boolean("streaming_enabled").notNull().default(true),
  contextTokenLimit: integer("context_token_limit").notNull().default(8000),
  fallbackPolicy: varchar("fallback_policy", { length: 32 }).notNull().default("on_error"),
  budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(5000),
  perUserDailyMessageLimit: integer("per_user_daily_message_limit").notNull().default(50),
  perUserMonthlyTokenLimit: integer("per_user_monthly_token_limit").notNull().default(200000),
  conversationLimit: integer("conversation_limit").notNull().default(500),
  fileLimit: integer("file_limit").notNull().default(20),
  storageLimitBytes: integer("storage_limit_bytes").notNull().default(104857600),
});

export const toolProviderCredentials = pgTable(
  "tool_provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    keyHint: varchar("key_hint", { length: 16 }).notNull(),
    baseUrl: text("base_url"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: varchar("last_test_status", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tool_provider_credentials_tool_provider_idx").on(table.toolId, table.providerId),
    index("tool_provider_credentials_tool_idx").on(table.toolId),
  ],
);

export const toolCapabilities = pgTable("tool_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  text: boolean("text").notNull().default(true),
  streaming: boolean("streaming").notNull().default(true),
  voiceInput: boolean("voice_input").notNull().default(false),
  voiceOutput: boolean("voice_output").notNull().default(false),
  files: boolean("files").notNull().default(false),
  images: boolean("images").notNull().default(false),
  forms: boolean("forms").notNull().default(false),
  quickReplies: boolean("quick_replies").notNull().default(true),
  menus: boolean("menus").notNull().default(false),
  memory: boolean("memory").notNull().default(false),
  history: boolean("history").notNull().default(true),
  rag: boolean("rag").notNull().default(false),
  exportEnabled: boolean("export_enabled").notNull().default(true),
  documentGeneration: boolean("document_generation").notNull().default(false),
  internalTools: boolean("internal_tools").notNull().default(false),
  externalApis: boolean("external_apis").notNull().default(false),
  notifications: boolean("notifications").notNull().default(false),
  evaluations: boolean("evaluations").notNull().default(true),
  escalation: boolean("escalation").notNull().default(false),
  feedback: boolean("feedback").notNull().default(true),
  pwa: boolean("pwa").notNull().default(true),
  deepLinks: boolean("deep_links").notNull().default(false),
  // externalApis (§ capacidad): admin-named, admin-URL'd endpoints only — the model can only
  // invoke by `name`, never supply its own URL, which is what keeps this from being an SSRF
  // vector. See lib/ai/tools/external.ts for the runtime allow-list + fetch guards.
  externalApiEndpoints: jsonb("external_api_endpoints")
    .$type<Array<{ name: string; url: string; method: "GET" | "POST"; description?: string }>>()
    .notNull()
    .default([]),
});

export const toolAccessRules = pgTable("tool_access_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  mode: accessModeEnum("mode").notNull().default("ALL_USERS"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  quota: integer("quota"),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(false),
  gracePeriodDays: integer("grace_period_days").notNull().default(0),
  allowedHours: jsonb("allowed_hours").$type<{ start: string; end: string } | null>(),
  allowedCountries: jsonb("allowed_countries").$type<string[]>().notNull().default([]),
  featureFlagKey: varchar("feature_flag_key", { length: 80 }),
});

export const toolSafetyPolicies = pgTable("tool_safety_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("LOW"),
  disclaimers: jsonb("disclaimers").$type<string[]>().notNull().default([]),
  restrictedTopics: jsonb("restricted_topics").$type<string[]>().notNull().default([]),
  rejectionRules: jsonb("rejection_rules").$type<string[]>().notNull().default([]),
  inputModeration: boolean("input_moderation").notNull().default(true),
  outputModeration: boolean("output_moderation").notNull().default(true),
  riskSignals: jsonb("risk_signals").$type<string[]>().notNull().default([]),
  contingencyMessage: text("contingency_message"),
  escalationPolicy: text("escalation_policy"),
  ageRestriction: integer("age_restriction"),
  confirmationsRequired: jsonb("confirmations_required").$type<string[]>().notNull().default([]),
  allowedInternalTools: jsonb("allowed_internal_tools").$type<string[]>().notNull().default([]),
  prohibitedActions: jsonb("prohibited_actions").$type<string[]>().notNull().default([]),
});

export const toolPwaConfigs = pgTable("tool_pwa_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolVersionId: uuid("tool_version_id")
    .notNull()
    .unique()
    .references(() => toolVersions.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  shortName: varchar("short_name", { length: 40 }).notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  themeColor: varchar("theme_color", { length: 16 }).notNull().default("#1d4ed8"),
  backgroundColor: varchar("background_color", { length: 16 }).notNull().default("#ffffff"),
  startUrl: varchar("start_url", { length: 200 }).notNull(),
  scope: varchar("scope", { length: 200 }).notNull(),
  display: varchar("display", { length: 20 }).notNull().default("standalone"),
  orientation: varchar("orientation", { length: 20 }).notNull().default("any"),
  shortcuts: jsonb("shortcuts").$type<Array<{ name: string; url: string }>>().notNull().default([]),
  screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
  offlinePageUrl: varchar("offline_page_url", { length: 200 }).notNull().default("/offline.html"),
  updatePolicy: varchar("update_policy", { length: 20 }).notNull().default("prompt"),
  subdomain: varchar("subdomain", { length: 80 }),
  basePath: varchar("base_path", { length: 120 }),
  deepLinks: jsonb("deep_links").$type<string[]>().notNull().default([]),
});

export const toolQuickActions = pgTable(
  "tool_quick_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolVersionId: uuid("tool_version_id")
      .notNull()
      .references(() => toolVersions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    iconKey: varchar("icon_key", { length: 40 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("tool_quick_actions_version_idx").on(table.toolVersionId)],
);

export const toolFlows = pgTable(
  "tool_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolVersionId: uuid("tool_version_id")
      .notNull()
      .references(() => toolVersions.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    schemaJson: jsonb("schema_json").$type<Record<string, unknown>>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("tool_flows_version_idx").on(table.toolVersionId)],
);

export const toolPublications = pgTable(
  "tool_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    toolVersionId: uuid("tool_version_id")
      .notNull()
      .references(() => toolVersions.id, { onDelete: "cascade" }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 24 }).notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tool_publications_tool_idx").on(table.toolId)],
);

export const toolAssignments = pgTable(
  "tool_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 16 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    decision: varchar("decision", { length: 8 }).notNull().default("ALLOW"),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tool_assignments_tool_idx").on(table.toolId),
    index("tool_assignments_user_idx").on(table.userId),
    index("tool_assignments_group_idx").on(table.groupId),
    index("tool_assignments_role_idx").on(table.roleId),
  ],
);

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    reason: text("reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("access_requests_tool_user_idx").on(table.toolId, table.userId),
  ],
);

/** Per-user, self-service "I added this tool to my list" toggle — distinct from
 * tool_assignments (admin-managed allow/deny) and access_requests (approval workflow).
 * Drives the catalog AVAILABLE vs ACTIVE distinction (§10). */
export const toolActivations = pgTable(
  "tool_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("tool_activations_tool_user_idx").on(table.toolId, table.userId)],
);
