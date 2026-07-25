"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Behavior = NonNullable<FullVersionConfig["behavior"]>;

const MEMORY_MODES = ["DISABLED", "CONVERSATION_ONLY", "SESSION_ONLY", "USER_APPROVED", "STRUCTURED", "LONG_TERM"] as const;

export function BehaviorSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: Behavior | null }) {
  const [form, setForm] = useState({
    systemPrompt: initial?.systemPrompt ?? "",
    additionalInstructions: initial?.additionalInstructions ?? "",
    tone: initial?.tone ?? "",
    language: initial?.language ?? "es",
    welcomeMessage: initial?.welcomeMessage ?? "",
    errorMessage: initial?.errorMessage ?? "No fue posible generar una respuesta. Intenta nuevamente.",
    scopeNotice: initial?.scopeNotice ?? "",
    memoryMode: (initial?.memoryMode ?? "DISABLED") as (typeof MEMORY_MODES)[number],
    suggestedQuestionsText: (initial?.suggestedQuestions ?? []).join("\n"),
    rulesText: (initial?.rules ?? []).join("\n"),
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
          behavior: {
            systemPrompt: form.systemPrompt,
            additionalInstructions: form.additionalInstructions || undefined,
            tone: form.tone || undefined,
            language: form.language,
            welcomeMessage: form.welcomeMessage,
            errorMessage: form.errorMessage,
            scopeNotice: form.scopeNotice,
            memoryMode: form.memoryMode,
            suggestedQuestions: form.suggestedQuestionsText.split("\n").map((s) => s.trim()).filter(Boolean),
            rules: form.rulesText.split("\n").map((s) => s.trim()).filter(Boolean),
            allowedProfileFields: [],
            exampleExchanges: [],
          },
        }),
      });
      setMessage({ tone: "success", text: "Comportamiento guardado." });
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
        <Label htmlFor="b-systemPrompt">Prompt del sistema</Label>
        <Textarea id="b-systemPrompt" rows={6} value={form.systemPrompt} onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-welcomeMessage">Mensaje de bienvenida</Label>
        <Textarea id="b-welcomeMessage" rows={2} value={form.welcomeMessage} onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-scopeNotice">Aviso de alcance</Label>
        <Textarea id="b-scopeNotice" rows={2} value={form.scopeNotice} onChange={(e) => setForm((f) => ({ ...f, scopeNotice: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-tone">Tono</Label>
        <Input id="b-tone" value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-language">Idioma</Label>
        <Input id="b-language" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-errorMessage">Mensaje de error</Label>
        <Textarea id="b-errorMessage" rows={2} value={form.errorMessage} onChange={(e) => setForm((f) => ({ ...f, errorMessage: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-additionalInstructions">Instrucciones adicionales</Label>
        <Textarea
          id="b-additionalInstructions"
          rows={3}
          value={form.additionalInstructions}
          onChange={(e) => setForm((f) => ({ ...f, additionalInstructions: e.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="b-suggestedQuestions">Preguntas sugeridas (una por línea)</Label>
        <Textarea
          id="b-suggestedQuestions"
          rows={3}
          value={form.suggestedQuestionsText}
          onChange={(e) => setForm((f) => ({ ...f, suggestedQuestionsText: e.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="b-rules">Reglas (una por línea)</Label>
        <Textarea id="b-rules" rows={3} value={form.rulesText} onChange={(e) => setForm((f) => ({ ...f, rulesText: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="b-memoryMode">Modo de memoria</Label>
        <select
          id="b-memoryMode"
          value={form.memoryMode}
          onChange={(e) => setForm((f) => ({ ...f, memoryMode: e.target.value as typeof form.memoryMode }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {MEMORY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar comportamiento
      </Button>
    </div>
  );
}
