"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api/client";
import { modelsSchema, type ModelsInput } from "@/lib/validation/tools";
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
  // TanStack Query rather than a bare useEffect+fetch: this list is shared, cacheable,
  // read-only reference data (available models per provider) — exactly the kind of request
  // QueryProvider (app/layout.tsx) exists to dedupe/cache instead of refetching per mount.
  const { data: models = [] } = useQuery({
    queryKey: ["admin", "models", toolId],
    queryFn: () =>
      apiFetch<{ models: ModelOption[] }>(`/api/v1/admin/models?toolId=${toolId}`).then(
        (res) => res.models,
      ),
  });
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<ModelsInput>({
    resolver: zodResolver(modelsSchema),
    defaultValues: {
      providerId: initial?.providerId ?? undefined,
      primaryModelId: initial?.primaryModelId ?? undefined,
      fallbackModelId: initial?.fallbackModelId ?? undefined,
      temperature: initial ? Number(initial.temperature) : 0.7,
      topP: initial ? Number(initial.topP) : 1,
      maxOutputTokens: initial?.maxOutputTokens ?? 1024,
      timeoutMs: initial?.timeoutMs ?? 30000,
      maxRetries: initial?.maxRetries ?? 2,
      streamingEnabled: initial?.streamingEnabled ?? true,
      contextTokenLimit: initial?.contextTokenLimit ?? 8000,
      fallbackPolicy: (initial?.fallbackPolicy ?? "on_error") as ModelsInput["fallbackPolicy"],
      budgetMonthlyCents: initial?.budgetMonthlyCents ?? 5000,
      perUserDailyMessageLimit: initial?.perUserDailyMessageLimit ?? 50,
      perUserMonthlyTokenLimit: initial?.perUserMonthlyTokenLimit ?? 200000,
      conversationLimit: initial?.conversationLimit ?? 500,
      fileLimit: initial?.fileLimit ?? 20,
      storageLimitBytes: initial?.storageLimitBytes ?? 104857600,
    },
  });

  const providerId = watch("providerId") ?? "";
  const primaryModelId = watch("primaryModelId") ?? "";
  const llmProviders = providers.filter((p) => p.kind === "llm");
  const availableModels = models.filter((m) => m.providerId === providerId);

  const onSubmit = async (data: ModelsInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ models: data }),
      });
      setMessage({ tone: "success", text: "Modelo guardado." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="m-provider">Proveedor</Label>
        <select
          id="m-provider"
          value={providerId}
          onChange={(e) => {
            setValue("providerId", e.target.value);
            setValue("primaryModelId", "");
          }}
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
          {...register("primaryModelId")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          disabled={!providerId}
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
          <Input id="m-temperature" type="number" step="0.1" min={0} max={2} {...register("temperature", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-topP">Top P</Label>
          <Input id="m-topP" type="number" step="0.05" min={0} max={1} {...register("topP", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-maxOutputTokens">Máximo de tokens de salida</Label>
          <Input id="m-maxOutputTokens" type="number" {...register("maxOutputTokens", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-contextTokenLimit">Límite de contexto</Label>
          <Input id="m-contextTokenLimit" type="number" {...register("contextTokenLimit", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-budget">Presupuesto mensual (centavos)</Label>
          <Input id="m-budget" type="number" {...register("budgetMonthlyCents", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-dailyLimit">Límite diario de mensajes por usuario</Label>
          <Input id="m-dailyLimit" type="number" {...register("perUserDailyMessageLimit", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-monthlyTokenLimit">Límite mensual de tokens por usuario</Label>
          <Input id="m-monthlyTokenLimit" type="number" {...register("perUserMonthlyTokenLimit", { valueAsNumber: true })} />
        </div>
        <div>
          <Label htmlFor="m-timeout">Timeout (ms)</Label>
          <Input id="m-timeout" type="number" {...register("timeoutMs", { valueAsNumber: true })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" {...register("streamingEnabled")} className="h-4 w-4 rounded border-border-strong" />
        Habilitar streaming
      </label>
      <Button type="submit" loading={isSubmitting} disabled={!providerId || !primaryModelId} className="self-start">
        Guardar modelo
      </Button>
    </form>
  );
}
