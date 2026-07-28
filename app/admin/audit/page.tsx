import { desc } from "drizzle-orm";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { AdminPageHeader, AdminPanel, AdminTableFrame } from "@/components/admin/AdminPage";

export const metadata = { title: "Auditoría — Admin" };

export default async function AdminAuditPage() {
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={ScrollText}
        title="Auditoría"
        description="Traza cambios administrativos, sus responsables y el resultado de cada operación."
      />
      {rows.length === 0 ? (
        <EmptyState title="No hay eventos de auditoría todavía" />
      ) : (
        <AdminPanel title={`${rows.length} eventos recientes`} description="Se muestran los últimos 200 registros." contentClassName="">
          <AdminTableFrame>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Recurso</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3 text-xs text-ink-faint">{new Date(event.createdAt).toLocaleString("es")}</td>
                    <td className="px-4 py-3 text-ink">
                      <Link href={`/admin/audit/${event.id}`} className="hover:underline">
                        {event.action}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {event.resourceType}
                      {event.resourceId ? ` (${event.resourceId.slice(0, 8)}…)` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={event.result === "SUCCESS" ? "success" : "danger"}>
                        {event.result === "SUCCESS" ? "Correcto" : "Fallido"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableFrame>
        </AdminPanel>
      )}
    </div>
  );
}
