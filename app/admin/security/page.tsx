import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { securityEvents } from "@/db/schema";
import { ShieldAlert } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Seguridad — Admin" };

const SEVERITY_TONE: Record<string, BadgeTone> = { INFO: "neutral", WARNING: "warning", CRITICAL: "danger" };
const SEVERITY_LABEL: Record<string, string> = { INFO: "Informativo", WARNING: "Advertencia", CRITICAL: "Crítico" };

export default async function AdminSecurityPage() {
  const rows = await db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={ShieldAlert}
        title="Eventos de seguridad"
        description="Revisa actividad sensible y señales que requieren atención administrativa."
      />
      {rows.length === 0 ? (
        <EmptyState title="No hay eventos de seguridad registrados" />
      ) : (
        <AdminPanel title={`${rows.length} eventos recientes`} description="Se muestran los últimos 200 registros." contentClassName="">
          <ul className="divide-y divide-border">
            {rows.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{event.kind}</p>
                  <p className="text-xs text-ink-faint">{new Date(event.createdAt).toLocaleString("es")}</p>
                </div>
                <Badge tone={SEVERITY_TONE[event.severity] ?? "neutral"}>{SEVERITY_LABEL[event.severity] ?? event.severity}</Badge>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
