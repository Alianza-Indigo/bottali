import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, costEvents, messages, toolActivations, tools, usageEvents, users } from "@/db/schema";
import { Card, CardBody } from "@/components/ui/Card";

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

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
