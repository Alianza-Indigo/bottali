import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { getToolOperationalMetrics } from "@/lib/analytics/repository";

/**
 * §27 GET /api/v1/admin/analytics/tools: per-tool usage — activations, conversations, messages.
 * Uses correlated subqueries (one per metric) instead of joining activations/conversations/
 * messages directly onto tools, which would fan out multiplicatively and require
 * COUNT(DISTINCT ...) gymnastics to correct — a subquery per metric is both clearer and cheaper.
 */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const rows = await getToolOperationalMetrics();

    return NextResponse.json({ tools: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
