import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usageEvents } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/** §27 GET /api/v1/admin/analytics/models: usage broken down by provider/model. */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const rows = await db
      .select({
        provider: usageEvents.provider,
        model: usageEvents.model,
        requests: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::bigint`,
        costCents: sql<number>`coalesce(sum(${usageEvents.costCents}), 0)::numeric`,
      })
      .from(usageEvents)
      .groupBy(usageEvents.provider, usageEvents.model)
      .orderBy(sql`count(*) desc`);

    return NextResponse.json({
      models: rows.map((r) => ({ ...r, inputTokens: Number(r.inputTokens), outputTokens: Number(r.outputTokens), costCents: Number(r.costCents) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
