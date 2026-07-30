import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationCases, evaluationResults, evaluationRuns, evaluationSuites, tools } from "@/db/schema";
import { runToolTest } from "@/lib/tools/test-run";
import { loadVersionConfig } from "@/lib/tools/repository";
import { recordAuditEvent } from "@/lib/audit/log";
import { AppError, NotFoundError } from "@/lib/utils/errors";

export interface CreateSuiteInput {
  toolId: string;
  name: string;
  description?: string;
  criteria: string[];
  isMandatoryForPublish: boolean;
  actorId: string;
}

export async function getEvaluationSuiteForOrganization(suiteId: string, organizationId: string) {
  const rows = await db
    .select({ suite: evaluationSuites })
    .from(evaluationSuites)
    .innerJoin(tools, eq(tools.id, evaluationSuites.toolId))
    .where(and(eq(evaluationSuites.id, suiteId), eq(tools.organizationId, organizationId)))
    .limit(1);
  const suite = rows[0]?.suite;
  if (!suite) throw new NotFoundError("Suite de evaluación no encontrada.");
  return suite;
}

/**
 * capabilities.evaluations is versioned, but suites are tool-level — gate against the tool's
 * current working version (draft if it has one, otherwise published), the closest real proxy
 * for "is this tool's evaluation capability on right now."
 */
async function assertToolAllowsEvaluations(toolId: string): Promise<void> {
  const [tool] = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
  if (!tool) throw new NotFoundError("Herramienta no encontrada.");
  const versionId = tool.draftVersionId ?? tool.publishedVersionId;
  if (!versionId) return;
  const config = await loadVersionConfig(versionId);
  if (config.capabilities && !config.capabilities.evaluations) {
    throw new AppError("Esta herramienta no tiene habilitada la capacidad de evaluaciones.", "EVALUATIONS_DISABLED", 409);
  }
}

export async function createSuite(input: CreateSuiteInput) {
  await assertToolAllowsEvaluations(input.toolId);
  const [suite] = await db
    .insert(evaluationSuites)
    .values({
      toolId: input.toolId,
      name: input.name,
      description: input.description,
      criteria: input.criteria,
      isMandatoryForPublish: input.isMandatoryForPublish ? 1 : 0,
      createdBy: input.actorId,
    })
    .returning();
  if (!suite) throw new Error("No fue posible crear la suite de evaluación.");
  await recordAuditEvent({ actorId: input.actorId, action: "evaluation_suite.create", resourceType: "evaluation_suite", resourceId: suite.id });
  return suite;
}

export async function addCase(suiteId: string, input: string, expectedBehavior: string, riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW") {
  const [testCase] = await db.insert(evaluationCases).values({ suiteId, input, expectedBehavior, riskLevel }).returning();
  return testCase;
}

/**
 * Runs every case in a suite against the given tool version through the real model
 * (fake provider in dev/test, whatever is configured otherwise) and scores each with a
 * deliberately simple heuristic: the run "passes" a case if the model produced a
 * non-empty, non-error response. This is honestly a baseline, not an LLM-graded rubric —
 * good enough to gate publishing on "the tool actually generates something" while being
 * transparent that richer scoring (fidelity/tone/safety grading) is a real follow-up, not
 * silently implied by this pass/fail signal.
 */
export async function runSuite(suiteId: string, toolVersionId: string, actorId: string) {
  const suiteRows = await db.select().from(evaluationSuites).where(eq(evaluationSuites.id, suiteId)).limit(1);
  const suite = suiteRows[0];
  if (!suite) throw new NotFoundError("Suite de evaluación no encontrada.");

  const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.suiteId, suiteId));

  const [run] = await db
    .insert(evaluationRuns)
    .values({ suiteId, toolVersionId, status: "RUNNING", triggeredBy: actorId, startedAt: new Date() })
    .returning();
  if (!run) throw new Error("No fue posible iniciar la ejecución.");

  let allPassed = cases.length > 0;
  for (const testCase of cases) {
    try {
      const result = await runToolTest(toolVersionId, testCase.input);
      const passed = result.reply.trim().length > 0;
      allPassed = allPassed && passed;
      await db.insert(evaluationResults).values({
        runId: run.id,
        caseId: testCase.id,
        actualOutput: result.reply,
        scores: { hasOutput: passed ? 1 : 0 },
        passed: passed ? 1 : 0,
        latencyMs: result.latencyMs,
        tokens: result.inputTokens + result.outputTokens,
      });
    } catch (error) {
      allPassed = false;
      await db.insert(evaluationResults).values({
        runId: run.id,
        caseId: testCase.id,
        actualOutput: null,
        scores: {},
        passed: 0,
        notes: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  await db
    .update(evaluationRuns)
    .set({ status: "COMPLETED", completedAt: new Date(), passed: allPassed ? 1 : 0, summary: { totalCases: cases.length } })
    .where(eq(evaluationRuns.id, run.id));

  await recordAuditEvent({
    actorId,
    action: "evaluation_suite.run",
    resourceType: "evaluation_run",
    resourceId: run.id,
    metadata: { suiteId, toolVersionId, passed: allPassed },
  });

  return { runId: run.id, passed: allPassed };
}
