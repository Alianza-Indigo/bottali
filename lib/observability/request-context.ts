import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

/**
 * Reads the request ID middleware.ts stamped onto this request (x-request-id), so every
 * audit event, log line, and error captured while handling the SAME request share one
 * correlation ID. Falls back to a fresh one for contexts with no active request — cron/job
 * handlers invoked directly rather than through middleware, or scripts.
 */
export async function getCurrentRequestId(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-request-id") ?? randomUUID();
  } catch {
    return randomUUID();
  }
}
