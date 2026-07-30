import Link from "next/link";
import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, notifications, toolActivations, toolBranding, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default async function DashboardPage() {
  const user = await requireCurrentUser();

  const [activeActivations, recentConversations, unreadNotifications] = await Promise.all([
    db
      .select({ toolId: toolActivations.toolId, name: toolBranding.name, slug: tools.slug })
      .from(toolActivations)
      .innerJoin(tools, eq(tools.id, toolActivations.toolId))
      .innerJoin(toolBranding, eq(toolBranding.toolVersionId, tools.publishedVersionId))
      .where(
        and(
          eq(tools.organizationId, user.organizationId),
          eq(toolActivations.userId, user.id),
          isNull(toolActivations.deactivatedAt),
        ),
      )
      .limit(6),
    db
      .select({ id: conversations.id, title: conversations.title, toolId: conversations.toolId, lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, user.organizationId),
          eq(conversations.userId, user.id),
          eq(conversations.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(5),
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Hola, {user.displayName ?? user.email}</h1>
        <p className="mt-1 text-sm text-ink-muted">Este es tu panel. Aquí verás tus herramientas activas y conversaciones recientes.</p>
      </div>

      <section aria-labelledby="active-tools-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="active-tools-heading" className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
            Herramientas activas
          </h2>
          <Link href="/tools" className="text-sm text-brand underline">
            Ver catálogo
          </Link>
        </div>
        {activeActivations.length === 0 ? (
          <EmptyState
            title="Aún no has activado ninguna herramienta"
            description="Explora el catálogo para encontrar herramientas disponibles para ti."
            action={
              <Link href="/tools">
                <Button size="sm">Explorar catálogo</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeActivations.map((tool) => (
              <Card key={tool.toolId}>
                <CardBody>
                  <p className="font-medium text-ink">{tool.name}</p>
                  <Link href={`/tools/${tool.slug}/chat`} className="mt-3 inline-block text-sm text-brand underline">
                    Abrir conversación
                  </Link>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="recent-conversations-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-conversations-heading" className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
            Conversaciones recientes
          </h2>
          <Link href="/conversations" className="text-sm text-brand underline">
            Ver todas
          </Link>
        </div>
        {recentConversations.length === 0 ? (
          <EmptyState title="No tienes conversaciones recientes" />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {recentConversations.map((conversation) => (
                <li key={conversation.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-ink">{conversation.title}</span>
                  <span className="text-xs text-ink-faint">
                    {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString("es") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">
          Notificaciones
        </h2>
        {unreadNotifications.length > 0 ? (
          <Badge tone="brand">{unreadNotifications.length} sin leer</Badge>
        ) : (
          <p className="text-sm text-ink-muted">No tienes notificaciones nuevas.</p>
        )}
      </section>
    </div>
  );
}
