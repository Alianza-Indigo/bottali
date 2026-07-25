import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { HistoryConversationRow } from "@/components/chat/HistoryConversationRow";

export default async function ToolHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireCurrentUser();

  const toolRows = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1);
  const tool = toolRows[0];
  if (!tool) notFound();

  const archived = await db
    .select({ id: conversations.id, title: conversations.title, archivedAt: conversations.archivedAt })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.toolId, tool.id), eq(conversations.status, "ARCHIVED")))
    .orderBy(desc(conversations.archivedAt));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Historial de conversaciones archivadas</h1>
      {archived.length === 0 ? (
        <EmptyState title="No hay conversaciones archivadas" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {archived.map((conversation) => (
              <HistoryConversationRow key={conversation.id} id={conversation.id} title={conversation.title} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
