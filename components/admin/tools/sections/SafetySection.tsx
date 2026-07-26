"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { safetyPoliciesSchema, type SafetyPoliciesInput } from "@/lib/validation/tools";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FieldError } from "@/components/ui/FieldError";
import type { FullVersionConfig } from "@/lib/tools/repository";

type SafetyPolicies = NonNullable<FullVersionConfig["safetyPolicies"]>;

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

// Mirrors lib/ai/tools/registry.ts's INTERNAL_TOOLS (§15) — hardcoded here rather than
// imported, since that registry module pulls in lib/db/client.ts (a real Postgres
// connection), which cannot be bundled into a "use client" component.
const AVAILABLE_INTERNAL_TOOLS = [
  { name: "calculator", description: "Calculadora" },
  { name: "datetime", description: "Fecha y hora" },
  { name: "generate_text_document", description: "Generación de documento" },
  { name: "knowledge_base_query", description: "Consulta a base de conocimiento" },
] as const;

export function SafetySection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: SafetyPolicies | null }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SafetyPoliciesInput>({
    resolver: zodResolver(safetyPoliciesSchema),
    defaultValues: {
      riskLevel: (initial?.riskLevel ?? "LOW") as (typeof RISK_LEVELS)[number],
      inputModeration: initial?.inputModeration ?? true,
      outputModeration: initial?.outputModeration ?? true,
      contingencyMessage: initial?.contingencyMessage ?? "",
      restrictedTopics: initial?.restrictedTopics ?? [],
      allowedInternalTools: initial?.allowedInternalTools ?? [],
      disclaimers: initial?.disclaimers ?? [],
      rejectionRules: initial?.rejectionRules ?? [],
      riskSignals: initial?.riskSignals ?? [],
      confirmationsRequired: initial?.confirmationsRequired ?? [],
      prohibitedActions: initial?.prohibitedActions ?? [],
      escalationPolicy: initial?.escalationPolicy ?? undefined,
      ageRestriction: initial?.ageRestriction ?? undefined,
    },
  });

  const onSubmit = async (data: SafetyPoliciesInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ safetyPolicies: data }),
      });
      setMessage({ tone: "success", text: "Políticas de seguridad guardadas." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="s-riskLevel">Nivel de riesgo</Label>
        <select
          id="s-riskLevel"
          {...register("riskLevel")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {RISK_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" {...register("inputModeration")} className="h-4 w-4 rounded border-border-strong" />
        Moderar entradas del usuario
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" {...register("outputModeration")} className="h-4 w-4 rounded border-border-strong" />
        Moderar respuestas generadas
      </label>
      <div>
        <Label htmlFor="s-contingency">Mensaje de contingencia</Label>
        <Textarea id="s-contingency" rows={2} aria-invalid={!!errors.contingencyMessage} {...register("contingencyMessage")} />
        <FieldError id="s-contingency-error" message={errors.contingencyMessage?.message} />
      </div>
      <div>
        <Label htmlFor="s-restrictedTopics">Temas restringidos (uno por línea)</Label>
        <Controller
          control={control}
          name="restrictedTopics"
          render={({ field }) => (
            <Textarea
              id="s-restrictedTopics"
              rows={3}
              value={(field.value ?? []).join("\n")}
              onChange={(e) =>
                field.onChange(
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          )}
        />
      </div>
      <div>
        <Label>Herramientas internas permitidas</Label>
        <p className="mb-2 text-xs text-ink-muted">
          El modelo solo podrá llamar a las herramientas marcadas aquí, y únicamente si la capacidad
          &quot;Herramientas internas&quot; también está activada en la sección de Capacidades.
        </p>
        <Controller
          control={control}
          name="allowedInternalTools"
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              {AVAILABLE_INTERNAL_TOOLS.map((tool) => (
                <label key={tool.name} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={(field.value ?? []).includes(tool.name)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked
                          ? [...(field.value ?? []), tool.name]
                          : (field.value ?? []).filter((name) => name !== tool.name),
                      )
                    }
                    className="h-4 w-4 rounded border-border-strong"
                  />
                  {tool.description} ({tool.name})
                </label>
              ))}
            </div>
          )}
        />
      </div>
      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar seguridad
      </Button>
    </form>
  );
}
