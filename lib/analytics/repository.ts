import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db/client";
import {
  auditEvents,
  backgroundJobs,
  conversations,
  costEvents,
  messages,
  securityEvents,
  toolActivations,
  toolBranding,
  tools,
  usageEvents,
  users,
} from "@/db/schema";

type Executor = DbOrTx;

export async function getAnalyticsOverview(executor: Executor = db) {
  const [[userCount], [publishedToolCount], [toolCount], [conversationCount], [messageCount], [tokenUsage], [costTotal], [activationCount]] =
    await Promise.all([
      executor.select({ count: sql<number>`count(*)::int` }).from(users),
      executor.select({ count: sql<number>`count(*)::int` }).from(tools).where(sql`${tools.status} = 'PUBLISHED'`),
      executor.select({ count: sql<number>`count(*)::int` }).from(tools),
      executor.select({ count: sql<number>`count(*)::int` }).from(conversations),
      executor.select({ count: sql<number>`count(*)::int` }).from(messages),
      executor.select({ total: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::bigint` }).from(usageEvents),
      executor.select({ total: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric` }).from(costEvents),
      executor.select({ count: sql<number>`count(*)::int` }).from(toolActivations),
    ]);

  return {
    users: userCount?.count ?? 0,
    publishedTools: publishedToolCount?.count ?? 0,
    totalTools: toolCount?.count ?? 0,
    conversations: conversationCount?.count ?? 0,
    messages: messageCount?.count ?? 0,
    totalTokens: Number(tokenUsage?.total ?? 0),
    totalCostCents: Number(costTotal?.total ?? 0),
    toolActivations: activationCount?.count ?? 0,
  };
}

export async function getToolOperationalMetrics(executor: Executor = db) {
  return executor
    .select({
      toolId: tools.id,
      slug: tools.slug,
      status: tools.status,
      name: sql<string>`coalesce(${toolBranding.name}, ${tools.slug})`,
      activations: sql<number>`(select count(*) from tool_activations where tool_activations.tool_id = ${tools.id})::int`,
      conversations: sql<number>`(select count(*) from conversations where conversations.tool_id = ${tools.id})::int`,
      messages: sql<number>`(select count(*) from messages m join conversations c on c.id = m.conversation_id where c.tool_id = ${tools.id})::int`,
      errors: sql<number>`(select count(*) from messages m join conversations c on c.id = m.conversation_id where c.tool_id = ${tools.id} and m.status = 'FAILED')::int`,
      averageLatencyMs: sql<number>`coalesce((select round(avg(m.latency_ms)) from messages m join conversations c on c.id = m.conversation_id where c.tool_id = ${tools.id} and m.latency_ms is not null), 0)::int`,
      tokens: sql<number>`coalesce((select sum(u.input_tokens + u.output_tokens) from usage_events u where u.tool_id = ${tools.id}), 0)::bigint`,
      costCents: sql<number>`coalesce((select sum(c.amount_cents) from cost_events c where c.tool_id = ${tools.id}), 0)::numeric`,
      activeUsers: sql<number>`(select count(distinct c.user_id) from conversations c where c.tool_id = ${tools.id} and c.updated_at >= now() - interval '30 days')::int`,
      abandonedConversations: sql<number>`(
        select count(*) from conversations c
        where c.tool_id = ${tools.id}
          and coalesce(c.last_message_at, c.created_at) < now() - interval '24 hours'
          and exists (select 1 from messages u where u.conversation_id = c.id and u.role = 'user')
          and not exists (
            select 1 from messages a
            where a.conversation_id = c.id and a.role = 'assistant' and a.status = 'COMPLETED'
              and a.created_at > (select max(u2.created_at) from messages u2 where u2.conversation_id = c.id and u2.role = 'user')
          )
      )::int`,
      failedToolCalls: sql<number>`(
        select count(*) from audit_events a
        where a.result = 'FAILURE'
          and a.resource_type in ('internal_tool', 'external_api')
          and a.metadata ->> 'toolId' = ${tools.id}::text
      )::int`,
    })
    .from(tools)
    .leftJoin(toolBranding, eq(toolBranding.toolVersionId, sql`coalesce(${tools.publishedVersionId}, ${tools.draftVersionId})`))
    .orderBy(desc(sql`(select count(*) from conversations where conversations.tool_id = ${tools.id})`));
}

export async function getModelUsage(executor: Executor = db) {
  return executor
    .select({
      provider: usageEvents.provider,
      model: usageEvents.model,
      requests: sql<number>`count(*)::int`,
      costCents: sql<number>`coalesce(sum(${usageEvents.costCents}), 0)::numeric`,
    })
    .from(usageEvents)
    .groupBy(usageEvents.provider, usageEvents.model)
    .orderBy(sql`count(*) desc`)
    .limit(10);
}

export async function getRecentIncidents(limit = 5, executor: Executor = db) {
  const [recentSecurityEvents, recentFailedJobs] = await Promise.all([
    executor.select().from(securityEvents).where(inArray(securityEvents.severity, ["WARNING", "CRITICAL"])).orderBy(desc(securityEvents.createdAt)).limit(limit),
    executor.select().from(backgroundJobs).where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"])).orderBy(desc(backgroundJobs.updatedAt)).limit(limit),
  ]);
  return { recentSecurityEvents, recentFailedJobs };
}

export async function getAnalyticsErrors(executor: Executor = db) {
  const [securityRows, failedAudit, failedJobs, jobFailureCounts] = await Promise.all([
    executor.select().from(securityEvents).where(inArray(securityEvents.severity, ["WARNING", "CRITICAL"])).orderBy(desc(securityEvents.createdAt)).limit(50),
    executor.select().from(auditEvents).where(or(sql`${auditEvents.result} = 'FAILURE'`)).orderBy(desc(auditEvents.createdAt)).limit(50),
    executor.select().from(backgroundJobs).where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"])).orderBy(desc(backgroundJobs.updatedAt)).limit(50),
    executor
      .select({ type: backgroundJobs.type, count: sql<number>`count(*)::int` })
      .from(backgroundJobs)
      .where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"]))
      .groupBy(backgroundJobs.type),
  ]);
  return { securityEvents: securityRows, failedAuditEvents: failedAudit, failedJobs, jobFailuresByType: jobFailureCounts };
}

export async function getOperationalAlerts(executor: Executor = db) {
  const [stuckJobs, [spend]] = await Promise.all([
    executor
      .select({ id: backgroundJobs.id, type: backgroundJobs.type, startedAt: backgroundJobs.startedAt })
      .from(backgroundJobs)
      .where(sql`${backgroundJobs.status} = 'RUNNING' and ${backgroundJobs.startedAt} < now() - interval '15 minutes'`),
    executor.select({
      last24Hours: sql<number>`coalesce(sum(case when ${costEvents.createdAt} >= now() - interval '24 hours' then ${costEvents.amountCents} else 0 end), 0)::numeric`,
      previousDailyAverage: sql<number>`coalesce(sum(case when ${costEvents.createdAt} >= now() - interval '8 days' and ${costEvents.createdAt} < now() - interval '24 hours' then ${costEvents.amountCents} else 0 end) / 7, 0)::numeric`,
    }).from(costEvents),
  ]);
  const last24Hours = Number(spend?.last24Hours ?? 0);
  const previousDailyAverage = Number(spend?.previousDailyAverage ?? 0);
  return {
    stuckJobs,
    spend: {
      last24Hours,
      previousDailyAverage,
      abnormal: last24Hours >= 100 && last24Hours > previousDailyAverage * 2,
    },
  };
}
