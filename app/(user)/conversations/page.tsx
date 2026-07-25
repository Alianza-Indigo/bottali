import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { conversations, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Conversaciones" };

export default async function ConversationsPage() {
  const user = await requireCurrentUser();

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      toolSlug: tools.slug,
    })
    .from(conversations)
    .innerJoin(tools, eq(tools.id, conversations.toolId))
    .where(and(eq(conversations.userId, user.id)))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);

  const visible = rows.filter((r) => r.status !== "DELETED");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Todas mis conversaciones</h1>
      {visible.length === 0 ? (
        <EmptyState title="No tienes conversaciones todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {visible.map((conversation) => (
              <li key={conversation.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/tools/${conversation.toolSlug}/chat`} className="text-sm text-ink hover:underline">
                  {conversation.title}
                </Link>
                <div className="flex items-center gap-2">
                  {conversation.status === "ARCHIVED" && <Badge tone="neutral">Archivada</Badge>}
                  <span className="text-xs text-ink-faint">
                    {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString("es") : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
