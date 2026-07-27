import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAnalyticsOverview, getModelUsage, getOperationalAlerts, getRecentIncidents, getToolOperationalMetrics } from "@/lib/analytics/repository";

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
      <h1 className="text-xl font-semibold text-ink">Analítica</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardBody>
              <p className="text-sm text-ink-muted">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{tile.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {(alerts.stuckJobs.length > 0 || alerts.spend.abnormal) && (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink">Alertas operativas</h2>
            {alerts.stuckJobs.length > 0 && <p className="text-sm text-danger">{alerts.stuckJobs.length} trabajos llevan más de 15 minutos en ejecución.</p>}
            {alerts.spend.abnormal && <p className="text-sm text-danger">El gasto de las últimas 24 horas supera el doble del promedio diario reciente.</p>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Uso por herramienta</h2>
          {toolUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso todavía" />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="pb-2">Herramienta</th>
                  <th className="pb-2">Conversaciones</th>
                  <th className="pb-2">Usuarios 30d</th>
                  <th className="pb-2">Errores</th>
                  <th className="pb-2">Latencia</th>
                  <th className="pb-2">Abandonadas</th>
                  <th className="pb-2">Llamadas fallidas</th>
                  <th className="pb-2">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toolUsage.map((row) => (
                  <tr key={row.toolId}>
                    <td className="py-2 text-ink">{row.name}</td>
                    <td className="py-2 text-ink-muted">{row.conversations}</td>
                    <td className="py-2 text-ink-muted">{row.activeUsers}</td>
                    <td className="py-2 text-ink-muted">{row.errors}</td>
                    <td className="py-2 text-ink-muted">{row.averageLatencyMs} ms</td>
                    <td className="py-2 text-ink-muted">{row.abandonedConversations}</td>
                    <td className="py-2 text-ink-muted">{row.failedToolCalls}</td>
                    <td className="py-2 text-ink-muted">${(Number(row.costCents) / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Uso por modelo</h2>
          {modelUsage.length === 0 ? (
            <EmptyState title="Sin datos de uso de modelos todavía" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2">Modelo</th>
                  <th className="pb-2">Solicitudes</th>
                  <th className="pb-2">Costo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modelUsage.map((row, i) => (
                  <tr key={`${row.provider}-${row.model}-${i}`}>
                    <td className="py-2 text-ink">{row.provider}</td>
                    <td className="py-2 text-ink-muted">{row.model}</td>
                    <td className="py-2 text-ink-muted">{row.requests}</td>
                    <td className="py-2 text-ink-muted">${(Number(row.costCents) / 100).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Incidentes recientes</h2>
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
        </CardBody>
      </Card>
    </div>
  );
}
