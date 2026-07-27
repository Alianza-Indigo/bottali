import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { getAnalyticsErrors, getOperationalAlerts } from "@/lib/analytics/repository";

/** §27 GET /api/v1/admin/analytics/errors: recent security events, failed audit actions, and
 * failed/dead-lettered jobs — the closest thing this platform has to an "errors" feed without
 * a real external error tracker (see also /admin/security and, if SENTRY_DSN is set, Sentry). */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const [errors, alerts] = await Promise.all([getAnalyticsErrors(), getOperationalAlerts()]);
    return NextResponse.json({ ...errors, alerts });
  } catch (error) {
    return handleApiError(error);
  }
}
