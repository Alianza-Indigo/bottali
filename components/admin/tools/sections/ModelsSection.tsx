"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Models = NonNullable<FullVersionConfig["models"]>;

interface ModelOption {
  id: string;
  modelKey: string;
  displayName: string;
  providerId: string;
}

export function ModelsSection({
  toolId,
  versionId,
  initial,
  providers,
}: {
  toolId: string;
  versionId: string;
  initial: Models | null;
  providers: Array<{ id: string; name: string; kind: string }>;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [form, setForm] = useState({
    providerId: initial?.providerId ?? "",
    primaryModelId: initial?.primaryModelId ?? "",
    temperature: initial ? Number(initial.temperature) : 0.7,
    topP: initial ? Number(initial.topP) : 1,
    maxOutputTokens: initial?.maxOutputTokens ?? 1024,
    timeoutMs: initial?.timeoutMs ?? 30000,
    maxRetries: initial?.maxRetries ?? 2,
    streamingEnabled: initial?.streamingEnabled ?? true,
    contextTokenLimit: initial?.contextTokenLimit ?? 8000,
    budgetMonthlyCents: initial?.budgetMonthlyCents ?? 5000,
    perUserDailyMessageLimit: initial?.perUserDailyMessageLimit ?? 50,
    perUserMonthlyTokenLimit: initial?.perUserMonthlyTokenLimit ?? 200000,
    conversationLimit: initial?.conversationLimit ?? 500,
    fileLimit: initial?.fileLimit ?? 20,
    storageLimitBytes: initial?.storageLimitBytes ?? 104857600,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    apiFetch<{ models: ModelOption[] }>("/api/v1/admin/models").then((res) => setModels(res.models));
  }, []);

  const llmProviders = providers.filter((p) => p.kind === "llm");
  const availableModels = models.filter((m) => m.providerId === form.providerId);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          models: { ...form, fallbackPolicy: "on_error" },
        }),
      });
      setMessage({ tone: "success", text: "Modelo guardado." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="m-provider">Proveedor</Label>
        <select
          id="m-provider"
          value={form.providerId}
          onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value, primaryModelId: "" }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">Selecciona un proveedor</option>
          {llmProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="m-model">Modelo principal</Label>
        <select
          id="m-model"
          value={form.primaryModelId}
          onChange={(e) => setForm((f) => ({ ...f, primaryModelId: e.target.value }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          disabled={!form.providerId}
        >
          <option value="">Selecciona un modelo</option>
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="m-temperature">Temperatura</Label>
          <Input
            id="m-temperature"
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={form.temperature}
            onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-topP">Top P</Label>
          <Input
            id="m-topP"
            type="number"
            step="0.05"
            min={0}
            max={1}
            value={form.topP}
            onChange={(e) => setForm((f) => ({ ...f, topP: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-maxOutputTokens">Máximo de tokens de salida</Label>
          <Input
            id="m-maxOutputTokens"
            type="number"
            value={form.maxOutputTokens}
            onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-contextTokenLimit">Límite de contexto</Label>
          <Input
            id="m-contextTokenLimit"
            type="number"
            value={form.contextTokenLimit}
            onChange={(e) => setForm((f) => ({ ...f, contextTokenLimit: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-budget">Presupuesto mensual (centavos)</Label>
          <Input
            id="m-budget"
            type="number"
            value={form.budgetMonthlyCents}
            onChange={(e) => setForm((f) => ({ ...f, budgetMonthlyCents: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-dailyLimit">Límite diario de mensajes por usuario</Label>
          <Input
            id="m-dailyLimit"
            type="number"
            value={form.perUserDailyMessageLimit}
            onChange={(e) => setForm((f) => ({ ...f, perUserDailyMessageLimit: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-monthlyTokenLimit">Límite mensual de tokens por usuario</Label>
          <Input
            id="m-monthlyTokenLimit"
            type="number"
            value={form.perUserMonthlyTokenLimit}
            onChange={(e) => setForm((f) => ({ ...f, perUserMonthlyTokenLimit: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="m-timeout">Timeout (ms)</Label>
          <Input id="m-timeout" type="number" value={form.timeoutMs} onChange={(e) => setForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.streamingEnabled}
          onChange={(e) => setForm((f) => ({ ...f, streamingEnabled: e.target.checked }))}
          className="h-4 w-4 rounded border-border-strong"
        />
        Habilitar streaming
      </label>
      <Button onClick={save} loading={saving} disabled={!form.providerId || !form.primaryModelId} className="self-start">
        Guardar modelo
      </Button>
    </div>
  );
}
