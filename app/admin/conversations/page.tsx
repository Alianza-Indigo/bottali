import Link from "next/link";
import { listConversationsForAdmin } from "@/lib/admin/conversation-content";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Conversaciones — Admin" };

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
  DELETED: "danger",
};

/** §30: this list is metadata-only (no message content) — gated by `conversations.metadata.read`
 * at the API layer; the detail page is where the separately-gated content read happens. */
export default async function AdminConversationsPage() {
  const { permissions } = await requireAdminAccess();
  if (!permissions.has("conversations.metadata.read")) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink">Conversaciones</h1>
        <EmptyState title="No tienes permiso para ver esta sección." />
      </div>
    );
  }

  const rows = await listConversationsForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Conversaciones</h1>
      <p className="text-sm text-ink-muted">
        Esta lista muestra únicamente metadatos (usuario, herramienta, estado, fechas). El contenido de los mensajes requiere un
        permiso adicional y un motivo registrado — ver el detalle de cada conversación.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No hay conversaciones todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link href={`/admin/conversations/${c.id}`} className="text-sm font-medium text-ink hover:underline">
                    {c.userEmail}
                  </Link>
                  <p className="text-xs text-ink-faint">
                    {c.toolSlug} · {c.messageCount} mensajes
                  </p>
                </div>
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
