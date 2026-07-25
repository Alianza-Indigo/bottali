import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { auditEvents, securityEvents } from "@/db/schema";
import { getRequestMetadata } from "@/lib/auth/session";

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
  await db.insert(auditEvents).values({
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    result: input.result ?? "SUCCESS",
    reason: input.reason,
    ipTruncated,
    userAgent,
    correlationId: input.correlationId ?? randomUUID(),
    metadata: input.metadata ?? {},
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
  await db.insert(securityEvents).values({
    kind: input.kind,
    severity: input.severity ?? "INFO",
    userId: input.userId ?? null,
    ipTruncated,
    details: input.details ?? {},
  });
}
