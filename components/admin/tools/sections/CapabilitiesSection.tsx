"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { capabilitiesSchema, type CapabilitiesInput } from "@/lib/validation/tools";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Capabilities = NonNullable<FullVersionConfig["capabilities"]>;

const CAPABILITY_LABELS: Record<keyof Omit<CapabilitiesInput, "externalApiEndpoints">, string> = {
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
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<CapabilitiesInput>({
    resolver: zodResolver(capabilitiesSchema),
    defaultValues: {
      ...Object.fromEntries(
        (Object.keys(CAPABILITY_LABELS) as Array<keyof typeof CAPABILITY_LABELS>).map((key) => [
          key,
          key === "text" ? true : Boolean(initial && (initial as Record<string, unknown>)[key]),
        ]),
      ),
      externalApiEndpoints: (initial?.externalApiEndpoints ?? []).map((e) => ({ ...e, description: e.description ?? "" })),
    } as CapabilitiesInput,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "externalApiEndpoints" });
  const externalApis = watch("externalApis");

  const onSubmit = async (data: CapabilitiesInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          capabilities: {
            ...data,
            externalApiEndpoints: data.externalApiEndpoints
              .filter((e) => e.name && e.url)
              .map((e) => ({ ...e, description: e.description || undefined })),
          },
        }),
      });
      setMessage({ tone: "success", text: "Capacidades guardadas." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(CAPABILITY_LABELS) as Array<[keyof typeof CAPABILITY_LABELS, string]>).map(([key, label]) => {
          // "Texto" is the base modality of every tool on this platform — there is no
          // non-text mode to fall back to, so disabling it would break the tool entirely.
          // Shown as always-on rather than faked as a togglable setting; it isn't registered
          // as an input (a disabled registered input's value would be dropped on submit) —
          // its `true` default value from defaultValues above flows through untouched.
          const alwaysOn = key === "text";
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                defaultChecked={alwaysOn ? true : undefined}
                disabled={alwaysOn}
                {...(alwaysOn ? {} : register(key))}
                className="h-4 w-4 rounded border-border-strong disabled:opacity-60"
              />
              {label}
              {alwaysOn && <span className="text-xs text-ink-faint">(siempre activo)</span>}
            </label>
          );
        })}
      </div>

      {externalApis && (
        <div className="flex flex-col gap-3 rounded border border-border p-3">
          <p className="text-sm font-medium text-ink">APIs externas permitidas</p>
          <p className="text-xs text-ink-faint">
            El modelo solo puede invocar por nombre — nunca puede elegir ni cambiar la URL de destino.
          </p>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-2 gap-2 rounded bg-surface-subtle p-2">
              <div>
                <Label htmlFor={`endpoint-name-${index}`}>Nombre</Label>
                <Input id={`endpoint-name-${index}`} placeholder="crear_ticket" {...register(`externalApiEndpoints.${index}.name`)} />
              </div>
              <div>
                <Label htmlFor={`endpoint-method-${index}`}>Método</Label>
                <select
                  id={`endpoint-method-${index}`}
                  {...register(`externalApiEndpoints.${index}.method`)}
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
                  placeholder="https://api.ejemplo.org/tickets"
                  {...register(`externalApiEndpoints.${index}.url`)}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`endpoint-desc-${index}`}>Descripción (para el modelo)</Label>
                <Input
                  id={`endpoint-desc-${index}`}
                  placeholder="Crea un ticket de soporte."
                  {...register(`externalApiEndpoints.${index}.description`)}
                />
              </div>
              <Button type="button" size="sm" variant="ghost" className="col-span-2 justify-self-start" onClick={() => remove(index)}>
                Quitar
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => append({ name: "", url: "", method: "GET", description: "" })}
          >
            Agregar endpoint
          </Button>
        </div>
      )}

      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar capacidades
      </Button>
    </form>
  );
}
