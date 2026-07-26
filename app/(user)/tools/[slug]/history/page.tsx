import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { conversations, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HistoryConversationRow } from "@/components/chat/HistoryConversationRow";

const PAGE_SIZE = 20;

// §46 "implementa paginación": bounded, offset-based query — a user with hundreds of
// archived conversations must not force one unbounded SELECT.
export default async function ToolHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const user = await requireCurrentUser();

  const toolRows = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1);
  const tool = toolRows[0];
  if (!tool) notFound();

  const whereClause = and(eq(conversations.userId, user.id), eq(conversations.toolId, tool.id), eq(conversations.status, "ARCHIVED"));

  const archived = await db
    .select({ id: conversations.id, title: conversations.title, archivedAt: conversations.archivedAt })
    .from(conversations)
    .where(whereClause)
    .orderBy(desc(conversations.archivedAt))
    .limit(PAGE_SIZE + 1) // fetch one extra row to know whether a next page exists, without a separate count query
    .offset((page - 1) * PAGE_SIZE);

  const hasNextPage = archived.length > PAGE_SIZE;
  const items = archived.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Historial de conversaciones archivadas</h1>
      {items.length === 0 ? (
        <EmptyState title="No hay conversaciones archivadas" />
      ) : (
        <>
          <Card>
            <ul className="divide-y divide-border">
              {items.map((conversation) => (
                <HistoryConversationRow key={conversation.id} id={conversation.id} title={conversation.title} />
              ))}
            </ul>
          </Card>
          <div className="flex items-center justify-between">
            <Link href={`/tools/${slug}/history?page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1}>
              <Button size="sm" variant="secondary" disabled={page <= 1}>
                Anterior
              </Button>
            </Link>
            <span className="text-sm text-ink-muted">Página {page}</span>
            <Link href={`/tools/${slug}/history?page=${page + 1}`} aria-disabled={!hasNextPage}>
              <Button size="sm" variant="secondary" disabled={!hasNextPage}>
                Siguiente
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
