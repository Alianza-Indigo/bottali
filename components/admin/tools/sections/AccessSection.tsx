"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { accessRulesSchema, type AccessRulesInput } from "@/lib/validation/tools";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type AccessRules = NonNullable<FullVersionConfig["accessRules"]>;

const MODES = ["ALL_USERS", "SELECTED_USERS", "GROUPS", "ROLES", "INVITATION", "REQUEST_APPROVAL"] as const;

export function AccessSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: AccessRules | null }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AccessRulesInput>({
    resolver: zodResolver(accessRulesSchema),
    defaultValues: {
      mode: (initial?.mode ?? "ALL_USERS") as (typeof MODES)[number],
      waitlistEnabled: initial?.waitlistEnabled ?? false,
      gracePeriodDays: initial?.gracePeriodDays ?? 0,
      quota: initial?.quota ?? undefined,
      startsAt: initial?.startsAt ? initial.startsAt.toISOString() : undefined,
      endsAt: initial?.endsAt ? initial.endsAt.toISOString() : undefined,
      allowedHours: initial?.allowedHours ?? null,
      allowedCountries: initial?.allowedCountries ?? [],
      featureFlagKey: initial?.featureFlagKey ?? undefined,
    },
  });

  const onSubmit = async (data: AccessRulesInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ accessRules: data }),
      });
      setMessage({ tone: "success", text: "Reglas de acceso guardadas." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="a-mode">Modo de acceso</Label>
        <select id="a-mode" {...register("mode")} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink">
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" {...register("waitlistEnabled")} className="h-4 w-4 rounded border-border-strong" />
        Habilitar lista de espera
      </label>
      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar acceso
      </Button>
    </form>
  );
}
