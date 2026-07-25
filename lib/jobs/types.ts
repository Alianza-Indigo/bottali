import type { ProviderHealth } from "@/lib/ai/types";

export interface JobOptions {
  maxAttempts?: number;
  idempotencyKey?: string;
  scheduledAt?: Date;
}

export interface JobReference {
  id: string;
}

export type JobStatusValue =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLING"
  | "CANCELLED"
  | "DEAD_LETTER";

export interface JobStatus {
  id: string;
  type: string;
  status: JobStatusValue;
  progress: number;
  attempt: number;
  maxAttempts: number;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface JobProvider {
  enqueue<TPayload>(type: string, payload: TPayload, options?: JobOptions): Promise<JobReference>;
  getStatus(jobId: string): Promise<JobStatus>;
  cancel(jobId: string): Promise<void>;
  healthcheck(): Promise<ProviderHealth>;
}

export interface JobExecutionContext {
  jobId: string;
  attempt: number;
  maxAttempts: number;
  reportProgress(progress: number): Promise<void>;
  isCancelled(): Promise<boolean>;
}

export type JobHandler<TPayload = unknown> = (payload: TPayload, context: JobExecutionContext) => Promise<Record<string, unknown> | void>;
