import "server-only";
import { db } from "@/lib/db/client";
import { auditEvents, securityEvents } from "@/db/schema";
import { getRequestMetadata } from "@/lib/auth/session";
import { getCurrentRequestId } from "@/lib/observability/request-context";
import { logger } from "@/lib/observability/logger";

export interface AuditEventInput {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: "SUCCESS" | "FAILURE";
  reason?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Never pass secrets, tokens, cookies, or full conversation content into `metadata` —
 * this table is readable by the AUDITOR role and must stay safe to expose.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const { ipTruncated, userAgent } = await getRequestMetadata().catch(() => ({
    ipTruncated: null,
    userAgent: null,
  }));
  const correlationId = input.correlationId ?? (await getCurrentRequestId());
  await db.insert(auditEvents).values({
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    result: input.result ?? "SUCCESS",
    reason: input.reason,
    ipTruncated,
    userAgent,
    correlationId,
    metadata: input.metadata ?? {},
  });
  logger.info("audit_event", {
    requestId: correlationId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    result: input.result ?? "SUCCESS",
  });
}

export interface SecurityEventInput {
  kind: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  userId?: string | null;
  details?: Record<string, unknown>;
}

export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  const { ipTruncated } = await getRequestMetadata().catch(() => ({ ipTruncated: null }));
  const severity = input.severity ?? "INFO";
  await db.insert(securityEvents).values({
    kind: input.kind,
    severity,
    userId: input.userId ?? null,
    ipTruncated,
    details: input.details ?? {},
  });
  // §35 "alertas": WARNING/CRITICAL security events log at elevated level — the admin
  // security feed plus (when SENTRY_DSN is set) Sentry are what stand in for a real
  // external alerting channel here.
  const logFn = severity === "CRITICAL" ? logger.error : severity === "WARNING" ? logger.warn : logger.info;
  logFn("security_event", { kind: input.kind, severity, userId: input.userId });
}
