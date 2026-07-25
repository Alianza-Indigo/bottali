import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Auditoría — Admin" };

export default async function AdminAuditPage() {
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Auditoría</h1>
      {rows.length === 0 ? (
        <EmptyState title="No hay eventos de auditoría todavía" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Acción</th>
                  <th className="px-4 py-2">Recurso</th>
                  <th className="px-4 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-2 text-xs text-ink-faint">{new Date(event.createdAt).toLocaleString("es")}</td>
                    <td className="px-4 py-2 text-ink">{event.action}</td>
                    <td className="px-4 py-2 text-ink-muted">
                      {event.resourceType}
                      {event.resourceId ? ` (${event.resourceId.slice(0, 8)}…)` : ""}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{event.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
