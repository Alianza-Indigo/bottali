"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { pwaConfigSchema, type PwaConfigInput } from "@/lib/validation/tools";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FieldError } from "@/components/ui/FieldError";
import type { FullVersionConfig } from "@/lib/tools/repository";

type PwaConfig = NonNullable<FullVersionConfig["pwaConfig"]>;

export function PwaSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: PwaConfig | null }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PwaConfigInput>({
    resolver: zodResolver(pwaConfigSchema),
    defaultValues: {
      name: initial?.name ?? "",
      shortName: initial?.shortName ?? "",
      description: initial?.description ?? "",
      themeColor: initial?.themeColor ?? "#1d4ed8",
      backgroundColor: initial?.backgroundColor ?? "#ffffff",
      startUrl: initial?.startUrl ?? "",
      scope: initial?.scope ?? "/tools/",
      display: (initial?.display ?? "standalone") as PwaConfigInput["display"],
      orientation: (initial?.orientation ?? "any") as PwaConfigInput["orientation"],
      offlinePageUrl: initial?.offlinePageUrl ?? "/offline.html",
      updatePolicy: (initial?.updatePolicy ?? "prompt") as PwaConfigInput["updatePolicy"],
      shortcuts: initial?.shortcuts ?? [],
      screenshots: initial?.screenshots ?? [],
      deepLinks: initial?.deepLinks ?? [],
      subdomain: initial?.subdomain ?? undefined,
      basePath: initial?.basePath ?? undefined,
    },
  });

  const onSubmit = async (data: PwaConfigInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ pwaConfig: data }),
      });
      setMessage({ tone: "success", text: "Configuración de PWA guardada." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="p-name">Nombre de la PWA</Label>
        <Input id="p-name" aria-invalid={!!errors.name} {...register("name")} />
        <FieldError id="p-name-error" message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="p-shortName">Nombre corto</Label>
        <Input id="p-shortName" aria-invalid={!!errors.shortName} {...register("shortName")} />
        <FieldError id="p-shortName-error" message={errors.shortName?.message} />
      </div>
      <div>
        <Label htmlFor="p-description">Descripción</Label>
        <Input id="p-description" aria-invalid={!!errors.description} {...register("description")} />
        <FieldError id="p-description-error" message={errors.description?.message} />
      </div>
      <div>
        <Label htmlFor="p-startUrl">start_url</Label>
        <Input id="p-startUrl" aria-invalid={!!errors.startUrl} {...register("startUrl")} />
        <FieldError id="p-startUrl-error" message={errors.startUrl?.message} />
      </div>
      <div>
        <Label htmlFor="p-scope">scope</Label>
        <Input id="p-scope" aria-invalid={!!errors.scope} {...register("scope")} />
        <FieldError id="p-scope-error" message={errors.scope?.message} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="p-themeColor">Color de tema</Label>
          <Input id="p-themeColor" type="color" aria-invalid={!!errors.themeColor} {...register("themeColor")} />
          <FieldError id="p-themeColor-error" message={errors.themeColor?.message} />
        </div>
        <div>
          <Label htmlFor="p-backgroundColor">Color de fondo</Label>
          <Input id="p-backgroundColor" type="color" aria-invalid={!!errors.backgroundColor} {...register("backgroundColor")} />
          <FieldError id="p-backgroundColor-error" message={errors.backgroundColor?.message} />
        </div>
      </div>
      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar PWA
      </Button>
    </form>
  );
}
