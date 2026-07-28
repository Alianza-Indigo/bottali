"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, ApiError } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface ProviderRow {
  id: string;
  key: string;
  kind: string;
  name: string;
  enabled: boolean;
  lastHealthcheckStatus: string | null;
}

export function ProvidersList({ providers }: { providers: ProviderRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const test = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const result = await apiPost<{ healthcheck: { healthy: boolean } }>(`/api/v1/admin/providers/${id}/test`);
      setStatus((prev) => ({ ...prev, [id]: result.healthcheck.healthy ? "healthy" : "unhealthy" }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible probar el proveedor.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await apiPatch(`/api/v1/admin/providers/${id}`, { enabled: !enabled });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible actualizar el proveedor.");
    } finally {
      setBusyId(null);
    }
  };

  const syncModels = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await apiPost(`/api/v1/admin/providers/${id}/sync-models`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible sincronizar los modelos.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="p-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-border">
        {providers.map((provider) => (
          <li key={provider.id} className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-5">
            <div className="min-w-0">
              <p className="text-sm text-ink">{provider.name}</p>
              <p className="text-xs text-ink-faint">
                {provider.kind} · {provider.key}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={provider.enabled ? "success" : "neutral"}>{provider.enabled ? "Habilitado" : "No configurado"}</Badge>
              {(status[provider.id] || provider.lastHealthcheckStatus) && (
                <Badge tone={(status[provider.id] ?? provider.lastHealthcheckStatus) === "healthy" ? "success" : "danger"}>
                  {(status[provider.id] ?? provider.lastHealthcheckStatus) === "healthy" ? "Disponible" : "Con problemas"}
                </Badge>
              )}
              <Button size="sm" variant="secondary" loading={busyId === provider.id} onClick={() => test(provider.id)}>
                Probar
              </Button>
              {provider.kind === "llm" && (
                <Button size="sm" variant="secondary" loading={busyId === provider.id} onClick={() => syncModels(provider.id)}>
                  Sincronizar modelos
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={busyId === provider.id} onClick={() => toggleEnabled(provider.id, provider.enabled)}>
                {provider.enabled ? "Deshabilitar" : "Habilitar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
