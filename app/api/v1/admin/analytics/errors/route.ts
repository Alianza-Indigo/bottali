import { NextResponse } from "next/server";
import { desc, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, backgroundJobs, securityEvents } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/** §27 GET /api/v1/admin/analytics/errors: recent security events, failed audit actions, and
 * failed/dead-lettered jobs — the closest thing this platform has to an "errors" feed without
 * a real external error tracker (see also /admin/security and, if SENTRY_DSN is set, Sentry). */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const [securityRows, failedAudit, failedJobs, jobFailureCounts] = await Promise.all([
      db
        .select()
        .from(securityEvents)
        .where(inArray(securityEvents.severity, ["WARNING", "CRITICAL"]))
        .orderBy(desc(securityEvents.createdAt))
        .limit(50),
      db.select().from(auditEvents).where(or(sql`${auditEvents.result} = 'FAILURE'`)).orderBy(desc(auditEvents.createdAt)).limit(50),
      db
        .select()
        .from(backgroundJobs)
        .where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"]))
        .orderBy(desc(backgroundJobs.updatedAt))
        .limit(50),
      db
        .select({ type: backgroundJobs.type, count: sql<number>`count(*)::int` })
        .from(backgroundJobs)
        .where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"]))
        .groupBy(backgroundJobs.type),
    ]);

    return NextResponse.json({
      securityEvents: securityRows,
      failedAuditEvents: failedAudit,
      failedJobs,
      jobFailuresByType: jobFailureCounts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
