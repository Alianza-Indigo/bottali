import "server-only";
import { getEnv } from "@/lib/env";
import type { JobProvider } from "./types";
import { CronPollingJobProvider, SyncJobProvider } from "./providers";

export * from "./types";
export { registerJobHandler, listRegisteredJobTypes } from "./registry";
export { getJobStatus } from "./service";

let cached: JobProvider | undefined;

export function getJobProvider(): JobProvider {
  if (cached) return cached;
  const env = getEnv();
  cached = env.JOB_PROVIDER === "vercel-queue" ? new CronPollingJobProvider() : new SyncJobProvider();
  return cached;
}
