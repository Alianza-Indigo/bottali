import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolBranding, tools } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/**
 * §27 GET /api/v1/admin/analytics/tools: per-tool usage — activations, conversations, messages.
 * Uses correlated subqueries (one per metric) instead of joining activations/conversations/
 * messages directly onto tools, which would fan out multiplicatively and require
 * COUNT(DISTINCT ...) gymnastics to correct — a subquery per metric is both clearer and cheaper.
 */
export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const rows = await db
      .select({
        toolId: tools.id,
        slug: tools.slug,
        status: tools.status,
        name: sql<string>`coalesce(${toolBranding.name}, ${tools.slug})`,
        activations: sql<number>`(select count(*) from tool_activations where tool_activations.tool_id = ${tools.id})::int`,
        conversations: sql<number>`(select count(*) from conversations where conversations.tool_id = ${tools.id})::int`,
        messages: sql<number>`(select count(*) from messages inner join conversations c on c.id = messages.conversation_id where c.tool_id = ${tools.id})::int`,
      })
      .from(tools)
      .leftJoin(toolBranding, eq(toolBranding.toolVersionId, sql`coalesce(${tools.publishedVersionId}, ${tools.draftVersionId})`));

    return NextResponse.json({ tools: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
