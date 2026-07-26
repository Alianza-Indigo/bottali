import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
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
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Analítica — Admin" };

export default async function AdminAnalyticsPage() {
  const [[usersCount], [publishedTools], [conversationsCount], [messagesCount], [tokens], [cost], [installs]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(tools).where(sql`${tools.status} = 'PUBLISHED'`),
    db.select({ count: sql<number>`count(*)::int` }).from(conversations),
    db.select({ count: sql<number>`count(*)::int` }).from(messages),
    db.select({ total: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::bigint` }).from(usageEvents),
    db.select({ total: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric` }).from(costEvents),
    db.select({ count: sql<number>`count(*)::int` }).from(toolActivations),
  ]);

  const tiles = [
    { label: "Usuarios totales", value: usersCount?.count ?? 0 },
    { label: "Herramientas publicadas", value: publishedTools?.count ?? 0 },
    { label: "Conversaciones", value: conversationsCount?.count ?? 0 },
    { label: "Mensajes", value: messagesCount?.count ?? 0 },
    { label: "Tokens consumidos", value: Number(tokens?.total ?? 0).toLocaleString("es") },
    { label: "Costo estimado (USD)", value: `$${(Number(cost?.total ?? 0) / 100).toFixed(2)}` },
    { label: "Instalaciones/activaciones", value: installs?.count ?? 0 },
  ];

  const toolUsage = await db
    .select({
      toolId: tools.id,
      slug: tools.slug,
      name: sql<string>`coalesce(${toolBranding.name}, ${tools.slug})`,
      activations: sql<number>`(select count(*) from tool_activations where tool_activations.tool_id = ${tools.id})::int`,
      conversations: sql<number>`(select count(*) from conversations where conversations.tool_id = ${tools.id})::int`,
    })
    .from(tools)
    .leftJoin(toolBranding, eq(toolBranding.toolVersionId, sql`coalesce(${tools.publishedVersionId}, ${tools.draftVersionId})`))
    .orderBy(desc(sql`(select count(*) from conversations where conversations.tool_id = ${tools.id})`))
    .limit(10);

  const modelUsage = await db
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

  const [recentSecurityEvents, recentFailedJobs] = await Promise.all([
    db.select().from(securityEvents).where(inArray(securityEvents.severity, ["WARNING", "CRITICAL"])).orderBy(desc(securityEvents.createdAt)).limit(5),
    db.select().from(backgroundJobs).where(inArray(backgroundJobs.status, ["FAILED", "DEAD_LETTER"])).orderBy(desc(backgroundJobs.updatedAt)).limit(5),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Analítica</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardBody>
              <p className="text-sm text-ink-muted">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{tile.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Uso por herramienta</h2>
          {toolUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso todavía" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="pb-2">Herramienta</th>
                  <th className="pb-2">Activaciones</th>
                  <th className="pb-2">Conversaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toolUsage.map((row) => (
                  <tr key={row.toolId}>
                    <td className="py-2 text-ink">{row.name}</td>
                    <td className="py-2 text-ink-muted">{row.activations}</td>
                    <td className="py-2 text-ink-muted">{row.conversations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Uso por modelo</h2>
          {modelUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso de modelos todavía" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2">Modelo</th>
                  <th className="pb-2">Solicitudes</th>
                  <th className="pb-2">Costo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modelUsage.map((row, i) => (
                  <tr key={`${row.provider}-${row.model}-${i}`}>
                    <td className="py-2 text-ink">{row.provider}</td>
                    <td className="py-2 text-ink-muted">{row.model}</td>
                    <td className="py-2 text-ink-muted">{row.requests}</td>
                    <td className="py-2 text-ink-muted">${(Number(row.costCents) / 100).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Incidentes recientes</h2>
          {recentSecurityEvents.length === 0 && recentFailedJobs.length === 0 ? (
            <EmptyState title="Sin incidentes recientes" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentSecurityEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between">
                  <span className="text-ink">{event.kind}</span>
                  <Badge tone={event.severity === "CRITICAL" ? "danger" : "warning"}>{event.severity}</Badge>
                </li>
              ))}
              {recentFailedJobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between">
                  <span className="text-ink">Trabajo {job.type}</span>
                  <Badge tone="danger">{job.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
