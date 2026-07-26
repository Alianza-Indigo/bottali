import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { getJobHandler } from "@/lib/jobs/registry";
import { processPendingJobs } from "@/lib/jobs/service";
import { processScheduledPublications } from "@/lib/tools/service";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

const HANDLER_NAMES = ["cleanup_expired_files", "expire_pending_tool_confirmations", "retention_cleanup", "provider_health_check"] as const;

/**
 * Single consolidated cron entry point (Vercel Hobby plan: cron jobs are capped at once a
 * day), replacing what used to be 5 separate crons at 5/10/15-minute and daily frequencies.
 * Real trade-off, not free: processPendingJobs and processScheduledPublications were
 * designed for near-real-time responsiveness (a queued export or a scheduled publish would
 * previously run within minutes) — running only once daily now means either can sit for up
 * to ~24h. batchSize is raised from the old 10 to absorb a full day's backlog in one call;
 * if job volume ever outgrows a single invocation's time budget, moving back to a
 * higher-frequency cron requires a paid plan.
 */
export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const jobContext = { jobId: "cron-daily", attempt: 1, maxAttempts: 1, reportProgress: async () => {}, isCancelled: async () => false };

    const results: Record<string, unknown> = {};
    results.jobs = await processPendingJobs(200);
    results.publications = await processScheduledPublications();
    for (const name of HANDLER_NAMES) {
      const handler = getJobHandler(name);
      if (!handler) throw new Error(`El manejador "${name}" no está registrado.`);
      results[name] = (await handler({}, jobContext)) ?? {};
    }

    await recordAuditEvent({ action: "cron.daily.run", resourceType: "cron", metadata: results });
    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error);
  }
}
