import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { getJobHandler } from "./registry";
import type { JobStatus, JobStatusValue } from "./types";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_JOB_TIMEOUT_MS = 55000; // stays under a typical serverless function ceiling

function toJobStatus(row: typeof backgroundJobs.$inferSelect): JobStatus {
  return {
    id: row.id,
    type: row.type,
    status: row.status as JobStatusValue,
    progress: row.progress,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    result: row.result,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

export async function createJobRecord(
  type: string,
  payload: unknown,
  options: { maxAttempts?: number; idempotencyKey?: string; scheduledAt?: Date } = {},
  createdBy?: string,
): Promise<string> {
  const idempotencyKey = options.idempotencyKey ?? `${type}:${JSON.stringify(payload)}:${Date.now()}`;

  const existing = await db.select({ id: backgroundJobs.id }).from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, idempotencyKey)).limit(1);
  if (existing[0]) return existing[0].id;

  const [job] = await db
    .insert(backgroundJobs)
    .values({
      type,
      payload: payload as Record<string, unknown>,
      status: "QUEUED",
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      idempotencyKey,
      scheduledAt: options.scheduledAt ?? new Date(),
      createdBy,
    })
    .returning({ id: backgroundJobs.id });
  if (!job) throw new Error("No fue posible crear el trabajo.");
  return job.id;
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const rows = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
  return rows[0] ? toJobStatus(rows[0]) : null;
}

export async function requestJobCancellation(jobId: string): Promise<void> {
  const rows = await db.select({ status: backgroundJobs.status }).from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
  const status = rows[0]?.status;
  if (!status) return;
  if (["CREATED", "QUEUED", "RETRYING"].includes(status)) {
    await db.update(backgroundJobs).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId));
  } else if (status === "RUNNING") {
    await db.update(backgroundJobs).set({ status: "CANCELLING", updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId));
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`El trabajo excedió el tiempo máximo de ejecución (${ms}ms).`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Executes one job synchronously to completion (or one failed attempt). Used directly by
 * the sync provider, and by the queue provider's cron-driven batch processor — both share
 * this single execution path so retry/backoff/timeout/dead-letter behavior never diverges.
 * Idempotent: re-running an already-terminal job (COMPLETED/FAILED/CANCELLED/DEAD_LETTER)
 * is a no-op, which is what makes at-least-once cron polling safe.
 */
export async function runJob(jobId: string): Promise<JobStatus> {
  const rows = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error(`Trabajo no encontrado: ${jobId}`);

  if (["COMPLETED", "FAILED", "CANCELLED", "DEAD_LETTER"].includes(job.status)) {
    return toJobStatus(job);
  }
  if (job.status === "CANCELLING") {
    await db.update(backgroundJobs).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId));
    return toJobStatus({ ...job, status: "CANCELLED" });
  }

  const handler = getJobHandler(job.type);
  if (!handler) {
    await db
      .update(backgroundJobs)
      .set({ status: "DEAD_LETTER", errorCode: "UNKNOWN_JOB_TYPE", errorMessage: `Tipo de trabajo no registrado: ${job.type}`, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId));
    return (await getJobStatus(jobId))!;
  }

  const attempt = job.attempt + 1;
  await db.update(backgroundJobs).set({ status: "RUNNING", attempt, startedAt: new Date(), updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId));

  try {
    const result = await withTimeout(
      handler(job.payload, {
        jobId,
        attempt,
        maxAttempts: job.maxAttempts,
        async reportProgress(progress: number) {
          await db.update(backgroundJobs).set({ progress, updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId));
        },
        async isCancelled() {
          const current = await db.select({ status: backgroundJobs.status }).from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1);
          return current[0]?.status === "CANCELLING";
        },
      }),
      DEFAULT_JOB_TIMEOUT_MS,
    );

    await db
      .update(backgroundJobs)
      .set({ status: "COMPLETED", result: result ?? {}, progress: 100, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const nextStatus: JobStatusValue = attempt >= job.maxAttempts ? "DEAD_LETTER" : "RETRYING";
    await db
      .update(backgroundJobs)
      .set({ status: nextStatus, errorCode: "EXECUTION_ERROR", errorMessage: message, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId));
  }

  return (await getJobStatus(jobId))!;
}

/** Batch entry point for the cron-driven queue provider (§6/§34): claims a small batch of
 * due jobs and runs each one attempt further. Small batches + short per-call timeout keep
 * this safe under Vercel Cron's own execution limits. */
export async function processPendingJobs(batchSize = 10): Promise<{ processed: number }> {
  const due = await db
    .select({ id: backgroundJobs.id })
    .from(backgroundJobs)
    .where(and(inArray(backgroundJobs.status, ["QUEUED", "RETRYING"]), lt(backgroundJobs.scheduledAt, new Date())))
    .limit(batchSize);

  for (const row of due) {
    await runJob(row.id);
  }
  return { processed: due.length };
}
