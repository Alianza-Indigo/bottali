import { getConversationSummaryForAdmin } from "@/lib/admin/conversation-content";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConversationContentViewer } from "@/components/admin/conversations/ConversationContentViewer";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Conversación — Admin" };

export default async function AdminConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await requireAdminAccess();
  const conversation = await getConversationSummaryForAdmin(id);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={MessageSquareText}
        title="Detalle de conversación"
        description="Acceso administrativo protegido y registrado para fines de soporte y cumplimiento."
      />
      <AdminPanel title="Metadatos">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-ink-muted">Usuario</dt><dd className="mt-1 truncate text-ink">{conversation.userEmail}</dd></div>
          <div><dt className="text-xs text-ink-muted">Herramienta</dt><dd className="mt-1 text-ink">{conversation.toolSlug}</dd></div>
          <div><dt className="text-xs text-ink-muted">Mensajes</dt><dd className="mt-1 text-ink">{conversation.messageCount}</dd></div>
          <div><dt className="text-xs text-ink-muted">Estado</dt><dd className="mt-1"><Badge tone="neutral">{conversation.status}</Badge></dd></div>
        </dl>
      </AdminPanel>
      <ConversationContentViewer conversationId={id} canReadContent={permissions.has("conversations.content.read")} />
    </div>
  );
}
