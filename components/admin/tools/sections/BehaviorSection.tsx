"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { behaviorSchema, type BehaviorInput } from "@/lib/validation/tools";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FieldError } from "@/components/ui/FieldError";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Behavior = NonNullable<FullVersionConfig["behavior"]>;

const MEMORY_MODES = ["DISABLED", "CONVERSATION_ONLY", "SESSION_ONLY", "USER_APPROVED", "STRUCTURED", "LONG_TERM"] as const;

/** Textarea-per-line editor for a schema field typed as string[] — kept as a Controller
 * (rather than a separate non-schema "...Text" field) so the form's actual state always
 * matches BehaviorInput exactly, with no client-only shadow fields to keep in sync. */
function LineListField({
  control,
  name,
  id,
  rows,
}: {
  control: ReturnType<typeof useForm<BehaviorInput>>["control"];
  name: "suggestedQuestions" | "rules";
  id: string;
  rows: number;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Textarea
          id={id}
          rows={rows}
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
  );
}

export function BehaviorSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: Behavior | null }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BehaviorInput>({
    resolver: zodResolver(behaviorSchema),
    defaultValues: {
      systemPrompt: initial?.systemPrompt ?? "",
      additionalInstructions: initial?.additionalInstructions ?? "",
      tone: initial?.tone ?? "",
      language: initial?.language ?? "es",
      welcomeMessage: initial?.welcomeMessage ?? "",
      errorMessage: initial?.errorMessage ?? "No fue posible generar una respuesta. Intenta nuevamente.",
      scopeNotice: initial?.scopeNotice ?? "",
      memoryMode: (initial?.memoryMode ?? "DISABLED") as (typeof MEMORY_MODES)[number],
      suggestedQuestions: initial?.suggestedQuestions ?? [],
      rules: initial?.rules ?? [],
      allowedProfileFields: initial?.allowedProfileFields ?? [],
      exampleExchanges: initial?.exampleExchanges ?? [],
    },
  });

  const onSubmit = async (data: BehaviorInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ behavior: data }),
      });
      setMessage({ tone: "success", text: "Comportamiento guardado." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="b-systemPrompt">Prompt del sistema</Label>
        <Textarea id="b-systemPrompt" rows={6} aria-invalid={!!errors.systemPrompt} {...register("systemPrompt")} />
        <FieldError id="b-systemPrompt-error" message={errors.systemPrompt?.message} />
      </div>
      <div>
        <Label htmlFor="b-welcomeMessage">Mensaje de bienvenida</Label>
        <Textarea id="b-welcomeMessage" rows={2} aria-invalid={!!errors.welcomeMessage} {...register("welcomeMessage")} />
        <FieldError id="b-welcomeMessage-error" message={errors.welcomeMessage?.message} />
      </div>
      <div>
        <Label htmlFor="b-scopeNotice">Aviso de alcance</Label>
        <Textarea id="b-scopeNotice" rows={2} aria-invalid={!!errors.scopeNotice} {...register("scopeNotice")} />
        <FieldError id="b-scopeNotice-error" message={errors.scopeNotice?.message} />
      </div>
      <div>
        <Label htmlFor="b-tone">Tono</Label>
        <Input id="b-tone" aria-invalid={!!errors.tone} {...register("tone")} />
        <FieldError id="b-tone-error" message={errors.tone?.message} />
      </div>
      <div>
        <Label htmlFor="b-language">Idioma</Label>
        <Input id="b-language" aria-invalid={!!errors.language} {...register("language")} />
        <FieldError id="b-language-error" message={errors.language?.message} />
      </div>
      <div>
        <Label htmlFor="b-errorMessage">Mensaje de error</Label>
        <Textarea id="b-errorMessage" rows={2} aria-invalid={!!errors.errorMessage} {...register("errorMessage")} />
        <FieldError id="b-errorMessage-error" message={errors.errorMessage?.message} />
      </div>
      <div>
        <Label htmlFor="b-additionalInstructions">Instrucciones adicionales</Label>
        <Textarea id="b-additionalInstructions" rows={3} aria-invalid={!!errors.additionalInstructions} {...register("additionalInstructions")} />
        <FieldError id="b-additionalInstructions-error" message={errors.additionalInstructions?.message} />
      </div>
      <div>
        <Label htmlFor="b-suggestedQuestions">Preguntas sugeridas (una por línea)</Label>
        <LineListField control={control} name="suggestedQuestions" id="b-suggestedQuestions" rows={3} />
      </div>
      <div>
        <Label htmlFor="b-rules">Reglas (una por línea)</Label>
        <LineListField control={control} name="rules" id="b-rules" rows={3} />
      </div>
      <div>
        <Label htmlFor="b-memoryMode">Modo de memoria</Label>
        <select
          id="b-memoryMode"
          {...register("memoryMode")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {MEMORY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar comportamiento
      </Button>
    </form>
  );
}
