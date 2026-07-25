import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages, tools, users, usageEvents, costEvents, toolActivations } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    const [[usersCount], [activeToolsCount], [publishedToolsCount], [conversationsCount], [messagesCount], [tokenUsage], [costTotal], [installs]] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(tools).where(sql`${tools.status} = 'PUBLISHED'`),
        db.select({ count: sql<number>`count(*)::int` }).from(tools),
        db.select({ count: sql<number>`count(*)::int` }).from(conversations),
        db.select({ count: sql<number>`count(*)::int` }).from(messages),
        db.select({ total: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::bigint` }).from(usageEvents),
        db.select({ total: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric` }).from(costEvents),
        db.select({ count: sql<number>`count(*)::int` }).from(toolActivations),
      ]);

    return NextResponse.json({
      users: usersCount?.count ?? 0,
      publishedTools: activeToolsCount?.count ?? 0,
      totalTools: publishedToolsCount?.count ?? 0,
      conversations: conversationsCount?.count ?? 0,
      messages: messagesCount?.count ?? 0,
      totalTokens: Number(tokenUsage?.total ?? 0),
      totalCostCents: Number(costTotal?.total ?? 0),
      toolActivations: installs?.count ?? 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
