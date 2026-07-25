"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api/client";
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

  return (
    <div>
      {error && (
        <div className="p-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-border">
        {providers.map((provider) => (
          <li key={provider.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm text-ink">{provider.name}</p>
              <p className="text-xs text-ink-faint">
                {provider.kind} · {provider.key}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={provider.enabled ? "success" : "neutral"}>{provider.enabled ? "Habilitado" : "No configurado"}</Badge>
              {(status[provider.id] || provider.lastHealthcheckStatus) && (
                <Badge tone={(status[provider.id] ?? provider.lastHealthcheckStatus) === "healthy" ? "success" : "danger"}>
                  {status[provider.id] ?? provider.lastHealthcheckStatus}
                </Badge>
              )}
              <Button size="sm" variant="secondary" loading={busyId === provider.id} onClick={() => test(provider.id)}>
                Probar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
