import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { registerJobHandler, getJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { createJobRecord, getJobStatus, processPendingJobs, runJob } from "@/lib/jobs/service";
import { SyncJobProvider, CronPollingJobProvider } from "@/lib/jobs/providers";

function registerOnce<TPayload>(type: string, handler: JobHandler<TPayload>) {
  if (!getJobHandler(type)) registerJobHandler(type, handler);
}

describe("job providers (real Postgres, no external queue)", () => {
  it("SyncJobProvider runs the job inline and returns a completed status", async () => {
    const type = `test-sync-${randomUUID().slice(0, 8)}`;
    registerOnce(type, async (payload: { n: number }) => ({ doubled: payload.n * 2 }));

    const provider = new SyncJobProvider();
    const { id } = await provider.enqueue(type, { n: 21 });
    const status = await provider.getStatus(id);

    expect(status.status).toBe("COMPLETED");
    expect(status.result).toEqual({ doubled: 42 });
  });

  it("CronPollingJobProvider leaves the job QUEUED until processPendingJobs runs", async () => {
    const type = `test-queue-${randomUUID().slice(0, 8)}`;
    registerOnce(type, async () => ({ ok: true }));

    const provider = new CronPollingJobProvider();
    const { id } = await provider.enqueue(type, {});
    const queuedStatus = await provider.getStatus(id);
    expect(queuedStatus.status).toBe("QUEUED");

    await processPendingJobs(50);
    const finalStatus = await provider.getStatus(id);
    expect(finalStatus.status).toBe("COMPLETED");
  });

  it("retries a failing job up to maxAttempts, then moves it to DEAD_LETTER", async () => {
    const type = `test-failing-${randomUUID().slice(0, 8)}`;
    registerOnce(type, async () => {
      throw new Error("fallo intencional de prueba");
    });

    const id = await createJobRecord(type, {}, { maxAttempts: 2 });

    const first = await runJob(id);
    expect(first.status).toBe("RETRYING");
    expect(first.attempt).toBe(1);

    const second = await runJob(id);
    expect(second.status).toBe("DEAD_LETTER");
    expect(second.attempt).toBe(2);
    expect(second.errorMessage).toContain("fallo intencional");
  });

  it("deduplicates enqueue calls sharing the same idempotency key", async () => {
    const type = `test-idempotent-${randomUUID().slice(0, 8)}`;
    registerOnce(type, async () => ({ ran: true }));

    const key = `dedupe-${randomUUID()}`;
    const first = await createJobRecord(type, {}, { idempotencyKey: key });
    const second = await createJobRecord(type, {}, { idempotencyKey: key });
    expect(first).toBe(second);

    const rows = await db.select().from(backgroundJobs).where(eq(backgroundJobs.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("is a no-op to re-run an already-terminal job", async () => {
    const type = `test-terminal-${randomUUID().slice(0, 8)}`;
    registerOnce(type, async () => ({ count: 1 }));

    const id = await createJobRecord(type, {});
    const completed = await runJob(id);
    expect(completed.status).toBe("COMPLETED");

    const rerun = await runJob(id);
    expect(rerun.status).toBe("COMPLETED");
    expect(rerun.attempt).toBe(completed.attempt); // did not run again
  });

  it("getJobStatus returns null for an unknown job id", async () => {
    const status = await getJobStatus(randomUUID());
    expect(status).toBeNull();
  });
});
