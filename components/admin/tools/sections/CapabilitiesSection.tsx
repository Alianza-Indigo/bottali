"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Capabilities = NonNullable<FullVersionConfig["capabilities"]>;

const CAPABILITY_LABELS: Record<string, string> = {
  text: "Texto",
  streaming: "Streaming",
  voiceInput: "Voz de entrada",
  voiceOutput: "Voz de salida",
  files: "Archivos",
  images: "Imágenes",
  forms: "Formularios",
  quickReplies: "Respuestas rápidas",
  menus: "Menús",
  memory: "Memoria",
  history: "Historial",
  rag: "Base de conocimiento (RAG)",
  exportEnabled: "Exportación",
  documentGeneration: "Generación de documentos",
  internalTools: "Herramientas internas",
  externalApis: "APIs externas",
  notifications: "Notificaciones",
  evaluations: "Evaluaciones",
  escalation: "Escalamiento",
  feedback: "Retroalimentación",
  pwa: "PWA",
  deepLinks: "Deep links",
};

export function CapabilitiesSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: Capabilities | null }) {
  const defaults: Record<string, boolean> = Object.fromEntries(Object.keys(CAPABILITY_LABELS).map((key) => [key, false]));
  const [form, setForm] = useState<Record<string, boolean>>(
    initial
      ? Object.fromEntries(Object.keys(CAPABILITY_LABELS).map((key) => [key, Boolean((initial as Record<string, unknown>)[key])]))
      : defaults,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ capabilities: form }),
      });
      setMessage({ tone: "success", text: "Capacidades guardadas." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form[key] ?? false}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              className="h-4 w-4 rounded border-border-strong"
            />
            {label}
          </label>
        ))}
      </div>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar capacidades
      </Button>
    </div>
  );
}
