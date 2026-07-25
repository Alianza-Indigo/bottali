import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { securityEvents } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Seguridad — Admin" };

const SEVERITY_TONE: Record<string, BadgeTone> = { INFO: "neutral", WARNING: "warning", CRITICAL: "danger" };

export default async function AdminSecurityPage() {
  const rows = await db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Eventos de seguridad</h1>
      {rows.length === 0 ? (
        <EmptyState title="No hay eventos de seguridad registrados" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((event) => (
              <li key={event.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-ink">{event.kind}</p>
                  <p className="text-xs text-ink-faint">{new Date(event.createdAt).toLocaleString("es")}</p>
                </div>
                <Badge tone={SEVERITY_TONE[event.severity] ?? "neutral"}>{event.severity}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
