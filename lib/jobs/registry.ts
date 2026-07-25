import type { JobHandler } from "./types";

/**
 * Every job "type" string must be registered here before it can be enqueued or processed —
 * an unregistered type fails fast instead of silently sitting in the queue forever.
 * Populated across modules (knowledge ingestion, exports, retention, ...); each module
 * calls `registerJobHandler` from its own file so this stays a plain lookup table.
 */
const handlers = new Map<string, JobHandler<unknown>>();

export function registerJobHandler<TPayload>(type: string, handler: JobHandler<TPayload>): void {
  if (handlers.has(type)) {
    throw new Error(`El tipo de trabajo "${type}" ya está registrado.`);
  }
  handlers.set(type, handler as JobHandler<unknown>);
}

export function getJobHandler(type: string): JobHandler<unknown> | undefined {
  return handlers.get(type);
}

export function listRegisteredJobTypes(): string[] {
  return Array.from(handlers.keys());
}
