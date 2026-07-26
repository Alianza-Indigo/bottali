"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
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
  const [form, setForm] = useState({
    riskLevel: (initial?.riskLevel ?? "LOW") as (typeof RISK_LEVELS)[number],
    inputModeration: initial?.inputModeration ?? true,
    outputModeration: initial?.outputModeration ?? true,
    contingencyMessage: initial?.contingencyMessage ?? "",
    restrictedTopicsText: (initial?.restrictedTopics ?? []).join("\n"),
    allowedInternalTools: initial?.allowedInternalTools ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          safetyPolicies: {
            riskLevel: form.riskLevel,
            inputModeration: form.inputModeration,
            outputModeration: form.outputModeration,
            contingencyMessage: form.contingencyMessage || undefined,
            restrictedTopics: form.restrictedTopicsText.split("\n").map((s) => s.trim()).filter(Boolean),
            disclaimers: [],
            rejectionRules: [],
            riskSignals: [],
            confirmationsRequired: [],
            allowedInternalTools: form.allowedInternalTools,
            prohibitedActions: [],
          },
        }),
      });
      setMessage({ tone: "success", text: "Políticas de seguridad guardadas." });
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
        <Label htmlFor="s-riskLevel">Nivel de riesgo</Label>
        <select
          id="s-riskLevel"
          value={form.riskLevel}
          onChange={(e) => setForm((f) => ({ ...f, riskLevel: e.target.value as typeof form.riskLevel }))}
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
        <input
          type="checkbox"
          checked={form.inputModeration}
          onChange={(e) => setForm((f) => ({ ...f, inputModeration: e.target.checked }))}
          className="h-4 w-4 rounded border-border-strong"
        />
        Moderar entradas del usuario
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.outputModeration}
          onChange={(e) => setForm((f) => ({ ...f, outputModeration: e.target.checked }))}
          className="h-4 w-4 rounded border-border-strong"
        />
        Moderar respuestas generadas
      </label>
      <div>
        <Label htmlFor="s-contingency">Mensaje de contingencia</Label>
        <Textarea
          id="s-contingency"
          rows={2}
          value={form.contingencyMessage}
          onChange={(e) => setForm((f) => ({ ...f, contingencyMessage: e.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="s-restrictedTopics">Temas restringidos (uno por línea)</Label>
        <Textarea
          id="s-restrictedTopics"
          rows={3}
          value={form.restrictedTopicsText}
          onChange={(e) => setForm((f) => ({ ...f, restrictedTopicsText: e.target.value }))}
        />
      </div>
      <div>
        <Label>Herramientas internas permitidas</Label>
        <p className="mb-2 text-xs text-ink-muted">
          El modelo solo podrá llamar a las herramientas marcadas aquí, y únicamente si la capacidad
          &quot;Herramientas internas&quot; también está activada en la sección de Capacidades.
        </p>
        <div className="flex flex-col gap-2">
          {AVAILABLE_INTERNAL_TOOLS.map((tool) => (
            <label key={tool.name} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.allowedInternalTools.includes(tool.name)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    allowedInternalTools: e.target.checked
                      ? [...f.allowedInternalTools, tool.name]
                      : f.allowedInternalTools.filter((name) => name !== tool.name),
                  }))
                }
                className="h-4 w-4 rounded border-border-strong"
              />
              {tool.description} ({tool.name})
            </label>
          ))}
        </div>
      </div>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar seguridad
      </Button>
    </div>
  );
}
