import "server-only";
import * as Sentry from "@sentry/node";

let initialized = false;

/**
 * §35 "captura de errores": only ever activates when SENTRY_DSN is actually set — no
 * Sentry SDK network calls happen otherwise, and captureException() below becomes a no-op.
 * Uses the lower-level @sentry/node SDK rather than @sentry/nextjs deliberately: the latter's
 * webpack plugin + source-map upload wiring needs a real Sentry project/auth token to work
 * correctly, which isn't available to verify in this environment — @sentry/node still gives
 * genuine error capture/transport without that build-time coupling.
 */
function ensureInitialized(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  if (!initialized) {
    Sentry.init({
      dsn,
      environment: process.env.APP_ENV ?? "development",
      tracesSampleRate: 0,
    });
    initialized = true;
  }
  return true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!ensureInitialized()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureMessage(message: string, level: "warning" | "error" = "warning"): void {
  if (!ensureInitialized()) return;
  Sentry.captureMessage(message, level);
}
