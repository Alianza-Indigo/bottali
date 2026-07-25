import type { ProviderHealth } from "@/lib/ai/types";
import type { JobOptions, JobProvider, JobReference, JobStatus } from "./types";
import { createJobRecord, getJobStatus, requestJobCancellation, runJob } from "./service";

/** Runs the job inline, within the same request — no real queue. Matches spec §34's
 * "un proveedor síncrono para pruebas" and is also fine for genuinely short jobs in dev. */
export class SyncJobProvider implements JobProvider {
  async enqueue<TPayload>(type: string, payload: TPayload, options?: JobOptions): Promise<JobReference> {
    const id = await createJobRecord(type, payload, options ?? {});
    await runJob(id);
    return { id };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const status = await getJobStatus(jobId);
    if (!status) throw new Error(`Trabajo no encontrado: ${jobId}`);
    return status;
  }

  async cancel(jobId: string): Promise<void> {
    await requestJobCancellation(jobId);
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, checkedAt: new Date().toISOString() };
  }
}

/**
 * Persists the job as QUEUED in Postgres and returns immediately — a Vercel Cron job
 * (§6, /api/v1/cron/jobs) polls and drains the queue in small batches on its own schedule.
 * This is a real, working serverless-compatible queue built entirely on Postgres + Cron,
 * with no external queue service to provision. Swapping in a managed queue (Vercel Queue,
 * QStash, Upstash Workflow) later is a drop-in replacement behind this same interface —
 * enqueue/getStatus/cancel/healthcheck — nothing else in the codebase would need to change.
 */
export class CronPollingJobProvider implements JobProvider {
  async enqueue<TPayload>(type: string, payload: TPayload, options?: JobOptions): Promise<JobReference> {
    const id = await createJobRecord(type, payload, options ?? {});
    return { id };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const status = await getJobStatus(jobId);
    if (!status) throw new Error(`Trabajo no encontrado: ${jobId}`);
    return status;
  }

  async cancel(jobId: string): Promise<void> {
    await requestJobCancellation(jobId);
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, checkedAt: new Date().toISOString() };
  }
}
