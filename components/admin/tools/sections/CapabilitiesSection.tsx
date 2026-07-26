"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Capabilities = NonNullable<FullVersionConfig["capabilities"]>;

interface EndpointRow {
  name: string;
  url: string;
  method: "GET" | "POST";
  description: string;
}

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
  // Tracked separately from `form` (booleans only) — this must always be re-sent on every
  // save (see below), or an unrelated checkbox toggle would silently wipe out previously
  // configured endpoints: updateCapabilities() is a full column overwrite, not a merge.
  const [endpoints, setEndpoints] = useState<EndpointRow[]>(
    (initial?.externalApiEndpoints ?? []).map((e) => ({ ...e, description: e.description ?? "" })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          capabilities: {
            ...form,
            externalApiEndpoints: endpoints
              .filter((e) => e.name && e.url)
              .map((e) => ({ ...e, description: e.description || undefined })),
          },
        }),
      });
      setMessage({ tone: "success", text: "Capacidades guardadas." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    } finally {
      setSaving(false);
    }
  };

  const updateEndpoint = (index: number, patch: Partial<EndpointRow>) => {
    setEndpoints((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
          // "Texto" is the base modality of every tool on this platform — there is no
          // non-text mode to fall back to, so disabling it would break the tool entirely.
          // Shown as always-on rather than faked as a togglable setting.
          const alwaysOn = key === "text";
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={alwaysOn ? true : (form[key] ?? false)}
                disabled={alwaysOn}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-border-strong disabled:opacity-60"
              />
              {label}
              {alwaysOn && <span className="text-xs text-ink-faint">(siempre activo)</span>}
            </label>
          );
        })}
      </div>

      {form.externalApis && (
        <div className="flex flex-col gap-3 rounded border border-border p-3">
          <p className="text-sm font-medium text-ink">APIs externas permitidas</p>
          <p className="text-xs text-ink-faint">
            El modelo solo puede invocar por nombre — nunca puede elegir ni cambiar la URL de destino.
          </p>
          {endpoints.map((endpoint, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded bg-surface-subtle p-2">
              <div>
                <Label htmlFor={`endpoint-name-${index}`}>Nombre</Label>
                <Input
                  id={`endpoint-name-${index}`}
                  value={endpoint.name}
                  onChange={(e) => updateEndpoint(index, { name: e.target.value })}
                  placeholder="crear_ticket"
                />
              </div>
              <div>
                <Label htmlFor={`endpoint-method-${index}`}>Método</Label>
                <select
                  id={`endpoint-method-${index}`}
                  value={endpoint.method}
                  onChange={(e) => updateEndpoint(index, { method: e.target.value as "GET" | "POST" })}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label htmlFor={`endpoint-url-${index}`}>URL (HTTPS)</Label>
                <Input
                  id={`endpoint-url-${index}`}
                  value={endpoint.url}
                  onChange={(e) => updateEndpoint(index, { url: e.target.value })}
                  placeholder="https://api.ejemplo.org/tickets"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`endpoint-desc-${index}`}>Descripción (para el modelo)</Label>
                <Input
                  id={`endpoint-desc-${index}`}
                  value={endpoint.description}
                  onChange={(e) => updateEndpoint(index, { description: e.target.value })}
                  placeholder="Crea un ticket de soporte."
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="col-span-2 justify-self-start"
                onClick={() => setEndpoints((prev) => prev.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => setEndpoints((prev) => [...prev, { name: "", url: "", method: "GET", description: "" }])}
          >
            Agregar endpoint
          </Button>
        </div>
      )}

      <Button onClick={save} loading={saving} className="self-start">
        Guardar capacidades
      </Button>
    </div>
  );
}
