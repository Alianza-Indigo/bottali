import { BarChart3, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAnalyticsOverview, getModelUsage, getOperationalAlerts, getRecentIncidents, getToolOperationalMetrics } from "@/lib/analytics/repository";
import { AdminPageHeader, AdminPanel, AdminTableFrame } from "@/components/admin/AdminPage";

export const metadata = { title: "Analítica — Admin" };

export default async function AdminAnalyticsPage() {
  const [overview, toolUsage, modelUsage, incidents, alerts] = await Promise.all([
    getAnalyticsOverview(),
    getToolOperationalMetrics(),
    getModelUsage(),
    getRecentIncidents(),
    getOperationalAlerts(),
  ]);

  const tiles = [
    { label: "Usuarios totales", value: overview.users },
    { label: "Herramientas publicadas", value: overview.publishedTools },
    { label: "Conversaciones", value: overview.conversations },
    { label: "Mensajes", value: overview.messages },
    { label: "Tokens consumidos", value: overview.totalTokens.toLocaleString("es") },
    { label: "Costo estimado (USD)", value: `$${(overview.totalCostCents / 100).toFixed(2)}` },
    { label: "Instalaciones/activaciones", value: overview.toolActivations },
  ];
  const { recentSecurityEvents, recentFailedJobs } = incidents;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={BarChart3}
        title="Analítica"
        description="Entiende adopción, consumo, rendimiento y salud operativa de toda la plataforma."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[8px] border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-sm text-ink-muted">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{tile.value}</p>
          </div>
        ))}
      </div>

      {(alerts.stuckJobs.length > 0 || alerts.spend.abnormal) && (
        <AdminPanel title="Alertas operativas" action={<TriangleAlert className="h-4 w-4 text-danger" />}>
          <div className="flex flex-col gap-2">
            {alerts.stuckJobs.length > 0 && <p className="text-sm text-danger">{alerts.stuckJobs.length} trabajos llevan más de 15 minutos en ejecución.</p>}
            {alerts.spend.abnormal && <p className="text-sm text-danger">El gasto de las últimas 24 horas supera el doble del promedio diario reciente.</p>}
          </div>
        </AdminPanel>
      )}

      <AdminPanel title="Uso por herramienta" description="Volumen, calidad operativa y costo por experiencia." contentClassName="">
          {toolUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso todavía" />
          ) : (
            <AdminTableFrame>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border bg-surface-subtle">
                <tr className="text-left text-ink-faint">
                  <th className="px-4 py-3 font-medium">Herramienta</th>
                  <th className="px-4 py-3 font-medium">Conversaciones</th>
                  <th className="px-4 py-3 font-medium">Usuarios 30d</th>
                  <th className="px-4 py-3 font-medium">Errores</th>
                  <th className="px-4 py-3 font-medium">Latencia</th>
                  <th className="px-4 py-3 font-medium">Abandonadas</th>
                  <th className="px-4 py-3 font-medium">Llamadas fallidas</th>
                  <th className="px-4 py-3 font-medium">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toolUsage.map((row) => (
                  <tr key={row.toolId}>
                    <td className="px-4 py-3 text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.conversations}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.activeUsers}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.errors}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.averageLatencyMs} ms</td>
                    <td className="px-4 py-3 text-ink-muted">{row.abandonedConversations}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.failedToolCalls}</td>
                    <td className="px-4 py-3 text-ink-muted">${(Number(row.costCents) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </AdminTableFrame>
          )}
      </AdminPanel>

      <AdminPanel title="Uso por modelo" description="Solicitudes y costo estimado por proveedor." contentClassName="">
          {modelUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso de modelos todavía" />
          ) : (
            <AdminTableFrame><table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-surface-subtle">
                <tr className="text-left text-ink-faint">
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">Solicitudes</th>
                  <th className="px-4 py-3 font-medium">Costo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modelUsage.map((row, i) => (
                  <tr key={`${row.provider}-${row.model}-${i}`}>
                    <td className="px-4 py-3 text-ink">{row.provider}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.model}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.requests}</td>
                    <td className="px-4 py-3 text-ink-muted">${(Number(row.costCents) / 100).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table></AdminTableFrame>
          )}
      </AdminPanel>

      <AdminPanel title="Incidentes recientes" description="Eventos de seguridad y trabajos fallidos que requieren revisión.">
          {recentSecurityEvents.length === 0 && recentFailedJobs.length === 0 ? (
            <EmptyState title="Sin incidentes recientes" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentSecurityEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between">
                  <span className="text-ink">{event.kind}</span>
                  <Badge tone={event.severity === "CRITICAL" ? "danger" : "warning"}>{event.severity}</Badge>
                </li>
              ))}
              {recentFailedJobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between">
                  <span className="text-ink">Trabajo {job.type}</span>
                  <Badge tone="danger">{job.status}</Badge>
                </li>
              ))}
            </ul>
          )}
      </AdminPanel>
    </div>
  );
}
