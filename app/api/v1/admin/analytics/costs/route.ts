import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { costEvents, tools } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/** §27 GET /api/v1/admin/analytics/costs: daily totals (last 30 days) and per-tool breakdown. */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const daily = await db
      .select({
        day: sql<string>`to_char(${costEvents.createdAt}, 'YYYY-MM-DD')`,
        totalCents: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric`,
      })
      .from(costEvents)
      .where(sql`${costEvents.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`to_char(${costEvents.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${costEvents.createdAt}, 'YYYY-MM-DD')`);

    const byTool = await db
      .select({
        toolId: costEvents.toolId,
        slug: tools.slug,
        totalCents: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric`,
      })
      .from(costEvents)
      .leftJoin(tools, sql`${tools.id} = ${costEvents.toolId}`)
      .groupBy(costEvents.toolId, tools.slug)
      .orderBy(sql`sum(${costEvents.amountCents}) desc`)
      .limit(20);

    return NextResponse.json({
      daily: daily.map((r) => ({ ...r, totalCents: Number(r.totalCents) })),
      byTool: byTool.map((r) => ({ ...r, totalCents: Number(r.totalCents) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
