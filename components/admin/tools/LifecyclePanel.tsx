"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { getPublicationStatusTone, getVisibleVersionStatus } from "@/lib/tools/presentation";

export function LifecyclePanel({
  toolId,
  versionId,
  versionStatus,
  versions,
  toolStatus,
}: {
  toolId: string;
  versionId: string;
  versionStatus: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  toolStatus: string;
}) {
  const router = useRouter();
  const [testMessage, setTestMessage] = useState("Hola, ¿cómo funcionas?");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<Record<string, { changed: string[] }> | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    setValidationErrors([]);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        const issues = e.issues;
        if (Array.isArray(issues)) setValidationErrors(issues as string[]);
      } else {
        setError("Ocurrió un error inesperado.");
      }
    } finally {
      setBusy(null);
    }
  }

  const schedulePublish = async () => {
    if (!scheduleDate) return;
    await run("schedule", () =>
      apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/schedule`, {
        scheduledFor: new Date(scheduleDate).toISOString(),
      }),
    );
    setShowSchedule(false);
  };

  const toggleCompare = (id: string) => {
    setCompareResult(null);
    setCompareSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  };

  const runCompare = async () => {
    if (compareSelection.length !== 2) return;
    setBusy("compare");
    setError(null);
    try {
      const [a, b] = compareSelection;
      const res = await apiFetch<{ diff: Record<string, { changed: string[] }> }>(
        `/api/v1/admin/tools/${toolId}/versions/compare?a=${a}&b=${b}`,
      );
      setCompareResult(res.diff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible comparar las versiones.");
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    setBusy("test");
    setError(null);
    try {
      const result = await apiPost<{ reply: string }>(`/api/v1/admin/tools/${toolId}/versions/${versionId}/test`, { message: testMessage });
      setTestResult(result.reply);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al probar la herramienta.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {(versionStatus === "DRAFT" || versionStatus === "TESTING") && <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Probar</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <Textarea rows={2} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
          <Button size="sm" loading={busy === "test"} onClick={runTest}>
            Enviar mensaje de prueba
          </Button>
          {testResult && <p className="rounded-md bg-surface-subtle p-2 text-xs text-ink">{testResult}</p>}
        </CardBody>
      </Card>}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Ciclo de vida</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {error && <Alert tone="danger">{error}</Alert>}
          {validationErrors.length > 0 && (
            <Alert tone="warning">
              <ul className="list-disc pl-4">
                {validationErrors.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          )}
          {versionStatus === "TESTING" && <Button
            size="sm"
            variant="secondary"
            loading={busy === "review"}
            onClick={() => run("review", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/review`))}
          >
            Enviar a revisión
          </Button>}
          {versionStatus === "UNDER_REVIEW" && <Button
            size="sm"
            variant="secondary"
            loading={busy === "approve"}
            onClick={() => run("approve", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/approve`))}
          >
            Aprobar
          </Button>}
          {versionStatus === "APPROVED" && <div className="flex gap-2">
            <Button
              size="sm"
              loading={busy === "publish"}
              onClick={() => run("publish", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/publish`))}
            >
              Publicar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSchedule((v) => !v)}>
              Programar
            </Button>
          </div>}
          {versionStatus === "APPROVED" && showSchedule && (
            <div className="flex items-end gap-2 rounded border border-border p-2">
              <div className="flex-1">
                <Label htmlFor="schedule-date">Fecha y hora de publicación</Label>
                <Input id="schedule-date" type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              </div>
              <Button size="sm" loading={busy === "schedule"} disabled={!scheduleDate} onClick={schedulePublish}>
                Confirmar
              </Button>
            </div>
          )}
          {toolStatus === "PUBLISHED" && (
            <Button size="sm" variant="secondary" loading={busy === "pause"} onClick={() => run("pause", () => apiPost(`/api/v1/admin/tools/${toolId}/pause`))}>
              Pausar
            </Button>
          )}
          {toolStatus === "PAUSED" && (
            <Button size="sm" loading={busy === "resume"} onClick={() => run("resume", () => apiPost(`/api/v1/admin/tools/${toolId}/resume`))}>
              Reanudar
            </Button>
          )}
          {(toolStatus === "PUBLISHED" || toolStatus === "PAUSED") && (
            <Button
              size="sm"
              variant="danger"
              loading={busy === "suspend"}
              onClick={() => run("suspend", () => apiPost(`/api/v1/admin/tools/${toolId}/suspend`, { reason: "Suspendida desde el panel administrativo." }))}
            >
              Suspender
            </Button>
          )}
          {["PUBLISHED", "PAUSED", "SUSPENDED"].includes(toolStatus) && <Button
            size="sm"
            variant="ghost"
            loading={busy === "archive"}
            onClick={() => run("archive", () => apiPost(`/api/v1/admin/tools/${toolId}/archive`))}
          >
            Archivar
          </Button>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Versiones</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <p className="text-xs text-ink-faint">Selecciona dos versiones para comparar su configuración.</p>
          {versions
            .sort((a, b) => b.versionNumber - a.versionNumber)
            .map((v) => {
              const visibleStatus = getVisibleVersionStatus(v.status);
              return (
              <div key={v.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar v${v.versionNumber} para comparar`}
                  checked={compareSelection.includes(v.id)}
                  onChange={() => toggleCompare(v.id)}
                  className="h-4 w-4 rounded border-border-strong"
                />
                <span className="text-ink">v{v.versionNumber}</span>
                <Badge tone={getPublicationStatusTone(visibleStatus)}>{visibleStatus}</Badge>
                {v.status === "SUPERSEDED" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === `rollback-${v.id}`}
                    onClick={() => run(`rollback-${v.id}`, () => apiPost(`/api/v1/admin/tools/${toolId}/rollback`, { targetVersionId: v.id }))}
                  >
                    Rollback
                  </Button>
                )}
              </div>
              );
            })}
          <Button size="sm" variant="secondary" className="self-start" disabled={compareSelection.length !== 2} loading={busy === "compare"} onClick={runCompare}>
            Comparar versiones seleccionadas
          </Button>
          {compareResult && (
            <div className="rounded border border-border bg-surface-subtle p-3 text-xs">
              {Object.entries(compareResult).every(([, v]) => v.changed.length === 0) ? (
                <p className="text-ink-muted">No hay diferencias entre estas dos versiones.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {Object.entries(compareResult)
                    .filter(([, v]) => v.changed.length > 0)
                    .map(([section, v]) => (
                      <li key={section}>
                        <span className="font-medium text-ink">{section}:</span> {v.changed.join(", ")}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
