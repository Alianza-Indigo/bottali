"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";

export function LifecyclePanel({
  toolId,
  versionId,
  versions,
  toolStatus,
}: {
  toolId: string;
  versionId: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  toolStatus: string;
}) {
  const router = useRouter();
  const [testMessage, setTestMessage] = useState("Hola, ¿cómo funcionas?");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

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

  const runTest = async () => {
    setBusy("test");
    setError(null);
    try {
      const result = await apiPost<{ reply: string }>(`/api/v1/admin/tools/${toolId}/versions/${versionId}/test`, { message: testMessage });
      setTestResult(result.reply);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al probar la herramienta.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
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
      </Card>

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
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "review"}
            onClick={() => run("review", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/review`))}
          >
            Enviar a revisión
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "approve"}
            onClick={() => run("approve", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/approve`))}
          >
            Aprobar
          </Button>
          <Button
            size="sm"
            loading={busy === "publish"}
            onClick={() => run("publish", () => apiPost(`/api/v1/admin/tools/${toolId}/versions/${versionId}/publish`))}
          >
            Publicar
          </Button>
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
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "archive"}
            onClick={() => run("archive", () => apiPost(`/api/v1/admin/tools/${toolId}/archive`))}
          >
            Archivar
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Versiones</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {versions
            .sort((a, b) => b.versionNumber - a.versionNumber)
            .map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">v{v.versionNumber}</span>
                <Badge tone={v.status === "PUBLISHED" ? "success" : "neutral"}>{v.status}</Badge>
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
            ))}
        </CardBody>
      </Card>
    </div>
  );
}
