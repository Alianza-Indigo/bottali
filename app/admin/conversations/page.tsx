import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { listConversationsForAdmin } from "@/lib/admin/conversation-content";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Conversaciones — Admin" };

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
  DELETED: "danger",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Activa", ARCHIVED: "Archivada", DELETED: "Eliminada" };

/** §30: this list is metadata-only (no message content) — gated by `conversations.metadata.read`
 * at the API layer; the detail page is where the separately-gated content read happens. */
export default async function AdminConversationsPage() {
  const { permissions } = await requireAdminAccess();
  if (!permissions.has("conversations.metadata.read")) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          icon={MessageSquareText}
          title="Conversaciones"
          description="Consulta metadatos de conversación según tus permisos administrativos."
        />
        <EmptyState title="No tienes permiso para ver esta sección." />
      </div>
    );
  }

  const rows = await listConversationsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={MessageSquareText}
        title="Conversaciones"
        description="Revisa usuario, herramienta, estado y volumen. El contenido requiere permiso adicional y un motivo registrado."
      />
      {rows.length === 0 ? (
        <EmptyState title="No hay conversaciones todavía" />
      ) : (
        <AdminPanel title={`${rows.length} conversaciones`} description="La lista no expone el contenido de los mensajes." contentClassName="">
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <Link href={`/admin/conversations/${c.id}`} className="text-sm font-medium text-ink hover:underline">
                    {c.userEmail}
                  </Link>
                  <p className="text-xs text-ink-faint">
                    {c.toolSlug} · {c.messageCount} mensajes
                  </p>
                </div>
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
