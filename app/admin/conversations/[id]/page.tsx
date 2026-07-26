import { getConversationSummaryForAdmin } from "@/lib/admin/conversation-content";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConversationContentViewer } from "@/components/admin/conversations/ConversationContentViewer";

export const metadata = { title: "Conversación — Admin" };

export default async function AdminConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await requireAdminAccess();
  const conversation = await getConversationSummaryForAdmin(id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Conversación</h1>
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Metadatos</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-1 text-sm text-ink">
          <p>Usuario: {conversation.userEmail}</p>
          <p>Herramienta: {conversation.toolSlug}</p>
          <p>Mensajes: {conversation.messageCount}</p>
          <p>
            Estado: <Badge tone="neutral">{conversation.status}</Badge>
          </p>
        </CardBody>
      </Card>
      <ConversationContentViewer conversationId={id} canReadContent={permissions.has("conversations.content.read")} />
    </div>
  );
}
