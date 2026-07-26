import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/** §27 GET /api/v1/admin/analytics/users: growth (last 30 days) and current status breakdown. */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const byStatus = await db
      .select({ status: users.status, count: sql<number>`count(*)::int` })
      .from(users)
      .groupBy(users.status);

    const dailySignups = await db
      .select({
        day: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

    return NextResponse.json({ byStatus, dailySignups });
  } catch (error) {
    return handleApiError(error);
  }
}
