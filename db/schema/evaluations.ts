import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tools, toolVersions } from "./tools";
import { evaluationRunStatusEnum } from "./enums";

export const evaluationSuites = pgTable("evaluation_suites", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id")
    .notNull()
    .references(() => tools.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  criteria: jsonb("criteria").$type<string[]>().notNull().default([]),
  thresholds: jsonb("thresholds").$type<Record<string, number>>().notNull().default({}),
  isMandatoryForPublish: integer("is_mandatory_for_publish").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationCases = pgTable(
  "evaluation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    suiteId: uuid("suite_id")
      .notNull()
      .references(() => evaluationSuites.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    expectedBehavior: text("expected_behavior").notNull(),
    rules: jsonb("rules").$type<string[]>().notNull().default([]),
    riskLevel: varchar("risk_level", { length: 16 }).notNull().default("LOW"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
  },
  (table) => [index("evaluation_cases_suite_idx").on(table.suiteId)],
);

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    suiteId: uuid("suite_id")
      .notNull()
      .references(() => evaluationSuites.id, { onDelete: "cascade" }),
    toolVersionId: uuid("tool_version_id")
      .notNull()
      .references(() => toolVersions.id, { onDelete: "cascade" }),
    status: evaluationRunStatusEnum("status").notNull().default("CREATED"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    passed: integer("passed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("evaluation_runs_version_idx").on(table.toolVersionId)],
);

export const evaluationResults = pgTable(
  "evaluation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => evaluationCases.id, { onDelete: "cascade" }),
    actualOutput: text("actual_output"),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    passed: integer("passed").notNull().default(0),
    latencyMs: integer("latency_ms"),
    tokens: integer("tokens"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("evaluation_results_run_idx").on(table.runId)],
);
