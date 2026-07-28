import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/db/schema";
import { Badge } from "@/components/ui/Badge";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Detalle de auditoría — Admin" };

export default async function AdminAuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
  const event = rows[0];
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={ScrollText}
        title={event.action}
        description="Detalle completo del evento registrado en la bitácora administrativa."
      />
      <AdminPanel title="Resumen del evento">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <span className="text-ink-muted">Resultado</span>
            <Badge tone={event.result === "SUCCESS" ? "success" : "danger"}>{event.result === "SUCCESS" ? "Correcto" : "Fallido"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <span className="text-ink-muted">Fecha</span>
            <span className="text-ink">{new Date(event.createdAt).toLocaleString("es")}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <span className="text-ink-muted">Recurso</span>
            <span className="text-ink">
              {event.resourceType} {event.resourceId ?? ""}
            </span>
          </div>
          {event.actorId && (
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <span className="text-ink-muted">Actor</span>
              <span className="text-ink">{event.actorId}</span>
            </div>
          )}
          {event.correlationId && (
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <span className="text-ink-muted">Correlation ID</span>
              <span className="font-mono text-xs text-ink">{event.correlationId}</span>
            </div>
          )}
          {event.reason && (
            <div className="md:col-span-2">
              <span className="text-ink-muted">Motivo</span>
              <p className="mt-1 text-ink">{event.reason}</p>
            </div>
          )}
          <div className="md:col-span-2">
            <span className="text-ink-muted">Metadatos</span>
            <pre className="mt-1 overflow-x-auto rounded-md bg-surface-subtle p-3 text-xs text-ink">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}
