import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const user = await requireCurrentUser();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Notificaciones</h1>
      {rows.length === 0 ? (
        <EmptyState title="No tienes notificaciones" />
      ) : (
        <Card>
          <NotificationsList
            notifications={rows.map((n) => ({ id: n.id, title: n.title, body: n.body, read: Boolean(n.readAt), link: n.link }))}
          />
        </Card>
      )}
    </div>
  );
}
