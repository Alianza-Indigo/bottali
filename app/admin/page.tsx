import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  getAnalyticsOverview,
  getConversationTrend,
  getOperationalAlerts,
  getRecentAuditActivity,
  getRecentIncidents,
  getToolOperationalMetrics,
} from "@/lib/analytics/repository";
import { getPublicationStatusTone, getVisibleToolStatus } from "@/lib/tools/presentation";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import type { PermissionKey } from "@/lib/permissions/definitions";

export const metadata = { title: "Panel administrativo" };

const ACTION_LABELS: Record<string, string> = {
  "tool.create": "Herramienta creada",
  "tool.version.publish": "Versión publicada",
  "tool.version.schedule": "Publicación programada",
  "tool.update.branding": "Identidad actualizada",
  "tool.update.behavior": "Comportamiento actualizado",
  "external_api.execute": "API externa ejecutada",
  "cron.daily.run": "Mantenimiento diario ejecutado",
  "auth.login.success": "Inicio de sesión administrativo",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDay(value: Date) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" }).format(value);
}

function buildTrend(rows: Awaited<ReturnType<typeof getConversationTrend>>) {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, count: counts.get(key) ?? 0 };
  });
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone: "teal" | "blue" | "green" | "red";
}) {
  const toneClasses = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className="rounded-[8px] border border-border bg-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-ink">{value}</p>
          <p className="mt-1 text-xs text-ink-faint">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { permissions } = await requireAdminAccess();
  if (!permissions.has("analytics.read")) {
    const fallbackRoutes: Array<[PermissionKey, string]> = [
      ["tools.read", "/admin/tools"],
      ["users.read", "/admin/users"],
      ["knowledge.read", "/admin/tools"],
      ["providers.read", "/admin/providers"],
      ["audit.read", "/admin/audit"],
      ["security.read", "/admin/security"],
      ["settings.manage", "/admin/settings"],
    ];
    const fallback = fallbackRoutes.find(([permission]) => permissions.has(permission));
    redirect(fallback?.[1] ?? "/dashboard");
  }
  const canReadAudit = permissions.has("audit.read");
  const canReadSecurity = permissions.has("security.read");

  const [overview, toolMetrics, operationalAlerts, incidents, auditActivity, trendRows] = await Promise.all([
    getAnalyticsOverview(),
    getToolOperationalMetrics(),
    getOperationalAlerts(),
    canReadSecurity ? getRecentIncidents(3) : Promise.resolve({ recentSecurityEvents: [], recentFailedJobs: [] }),
    canReadAudit ? getRecentAuditActivity(6) : Promise.resolve([]),
    getConversationTrend(7),
  ]);
  const trend = buildTrend(trendRows);
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);
  const recentIncidents = [...incidents.recentSecurityEvents, ...incidents.recentFailedJobs].slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">Resumen operativo</h1>
            <span className="hidden items-center gap-1 text-xs text-ink-faint md:flex">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Datos en tiempo real
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Salud, uso y actividad de la plataforma.</p>
        </div>
        <Link
          href="/admin/tools/new"
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Crear herramienta
        </Link>
      </header>

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuarios activos" value={formatNumber(overview.activeUsers)} detail={`${formatNumber(overview.users)} registrados`} icon={Users} tone="teal" />
        <MetricCard label="Conversaciones" value={formatNumber(overview.conversations)} detail={`${formatNumber(overview.messages)} mensajes`} icon={MessageSquare} tone="blue" />
        <MetricCard label="Costo acumulado" value={formatCurrency(overview.totalCostCents)} detail={`${formatNumber(overview.totalTokens)} tokens`} icon={CircleDollarSign} tone="green" />
        <MetricCard label="Errores de mensajes" value={formatNumber(overview.failedMessages)} detail={overview.failedMessages === 0 ? "Sin errores registrados" : "Requieren seguimiento"} icon={TriangleAlert} tone="red" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="overflow-hidden rounded-[8px] border border-border bg-surface-raised shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Herramientas</h2>
              <p className="text-xs text-ink-faint">Rendimiento y consumo por herramienta</p>
            </div>
            <Link href="/admin/tools" className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
              Ver todas
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead className="bg-surface-subtle text-ink-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Herramienta</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Usuarios</th>
                  <th className="px-3 py-2.5 text-right font-medium">Conversaciones</th>
                  <th className="px-3 py-2.5 text-right font-medium">Latencia</th>
                  <th className="px-3 py-2.5 text-right font-medium">Costo</th>
                  <th className="w-12 px-3 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toolMetrics.slice(0, 7).map((tool) => {
                  const status = getVisibleToolStatus(tool.status);
                  return (
                    <tr key={tool.toolId} className="hover:bg-surface-subtle/70">
                      <td className="px-4 py-3">
                        <Link href={`/admin/tools/${tool.toolId}`} className="flex items-center gap-2.5 font-medium text-ink hover:text-teal-700">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                            <Bot className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="max-w-52 truncate">{tool.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><Badge tone={getPublicationStatusTone(status)} className="rounded-md px-2 py-0.5">{status}</Badge></td>
                      <td className="px-3 py-3 text-right text-ink-muted">{formatNumber(tool.activeUsers)}</td>
                      <td className="px-3 py-3 text-right text-ink-muted">{formatNumber(tool.conversations)}</td>
                      <td className="px-3 py-3 text-right text-ink-muted">{tool.averageLatencyMs ? `${tool.averageLatencyMs} ms` : "—"}</td>
                      <td className="px-3 py-3 text-right text-ink-muted">{formatCurrency(Number(tool.costCents))}</td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/admin/tools/${tool.toolId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-surface-subtle hover:text-ink" aria-label={`Administrar ${tool.name}`}>
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {toolMetrics.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-muted">Aún no hay herramientas registradas.</p>}
        </section>

        <aside className="flex flex-col gap-5">
          <section className="rounded-[8px] border border-border bg-surface-raised shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Alertas operativas</h2>
              <Link href={canReadSecurity ? "/admin/security" : "/admin/analytics"} className="text-xs font-medium text-teal-700 hover:underline">Ver todas</Link>
            </div>
            <div className="divide-y divide-border px-4">
              {operationalAlerts.stuckJobs.length > 0 && (
                <div className="flex gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-warning-subtle text-warning"><Clock3 className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-medium text-ink">Trabajos atascados</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{operationalAlerts.stuckJobs.length} llevan más de 15 minutos en ejecución.</p>
                  </div>
                </div>
              )}
              {operationalAlerts.spend.abnormal && (
                <div className="flex gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-warning-subtle text-warning"><CircleDollarSign className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-medium text-ink">Gasto elevado</p>
                    <p className="mt-0.5 text-xs text-ink-muted">El consumo supera el doble del promedio reciente.</p>
                  </div>
                </div>
              )}
              {recentIncidents.map((incident) => (
                <div key={incident.id} className="flex gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-danger-subtle text-danger"><ShieldAlert className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{"kind" in incident ? incident.kind : `Trabajo ${incident.type}`}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">Requiere revisión administrativa.</p>
                  </div>
                </div>
              ))}
              {operationalAlerts.stuckJobs.length === 0 && !operationalAlerts.spend.abnormal && recentIncidents.length === 0 && (
                <div className="flex gap-3 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-success-subtle text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-medium text-ink">Sistema saludable</p>
                    <p className="mt-0.5 text-xs text-ink-muted">No hay alertas operativas activas.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {canReadAudit && <section className="rounded-[8px] border border-border bg-surface-raised shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Actividad reciente</h2>
              <Link href="/admin/audit" className="text-xs font-medium text-teal-700 hover:underline">Ver todo</Link>
            </div>
            <ol className="divide-y divide-border px-4">
              {auditActivity.map((event) => (
                <li key={event.id} className="flex gap-3 py-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.result === "SUCCESS" ? "bg-emerald-500" : "bg-red-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{ACTION_LABELS[event.action] ?? event.action.replaceAll(".", " ")}</p>
                    <p className="mt-1 truncate text-[11px] text-ink-faint">{event.actorEmail ?? "Sistema"} · {formatDateTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
              {auditActivity.length === 0 && <li className="py-6 text-center text-xs text-ink-muted">Sin actividad reciente.</li>}
            </ol>
          </section>}
        </aside>
      </div>

      <section className="rounded-[8px] border border-border bg-surface-raised p-4 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Uso de conversaciones</h2>
            <p className="text-xs text-ink-faint">Conversaciones creadas durante los últimos 7 días</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted"><Activity className="h-4 w-4 text-teal-700" aria-hidden="true" />Últimos 7 días</span>
        </div>
        <div className="flex h-40 items-end gap-2 sm:gap-4">
          {trend.map((item) => (
            <div key={item.date.toISOString()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[11px] font-medium text-ink-muted">{formatNumber(item.count)}</span>
              <div className="flex h-28 w-full items-end rounded-sm bg-surface-subtle">
                <div
                  className="w-full rounded-sm bg-teal-600 transition-[height]"
                  style={{ height: `${Math.max((item.count / maxTrend) * 100, item.count > 0 ? 8 : 2)}%` }}
                  aria-label={`${formatDay(item.date)}: ${item.count} conversaciones`}
                />
              </div>
              <span className="truncate text-[10px] text-ink-faint">{formatDay(item.date)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
