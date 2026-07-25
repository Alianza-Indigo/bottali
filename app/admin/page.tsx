import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools, users, conversations } from "@/db/schema";
import { Card, CardBody } from "@/components/ui/Card";

export const metadata = { title: "Panel administrativo" };

async function getCounts() {
  const [[usersCount], [publishedTools], [conversationsCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(tools).where(sql`${tools.status} = 'PUBLISHED'`),
    db.select({ count: sql<number>`count(*)::int` }).from(conversations),
  ]);
  return {
    users: usersCount?.count ?? 0,
    publishedTools: publishedTools?.count ?? 0,
    conversations: conversationsCount?.count ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const counts = await getCounts();

  const tiles = [
    { label: "Usuarios totales", value: counts.users },
    { label: "Herramientas publicadas", value: counts.publishedTools },
    { label: "Conversaciones totales", value: counts.conversations },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Resumen de la plataforma</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
