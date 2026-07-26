"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch, ApiError } from "@/lib/api/client";
import { brandingSchema, type BrandingInput } from "@/lib/validation/tools";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FieldError } from "@/components/ui/FieldError";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Branding = NonNullable<FullVersionConfig["branding"]>;

export function IdentitySection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: Branding | null }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BrandingInput>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      name: initial?.name ?? "",
      shortName: initial?.shortName ?? "",
      description: initial?.description ?? "",
      fullDescription: initial?.fullDescription ?? "",
      tags: initial?.tags ?? [],
      targetAudience: initial?.targetAudience ?? "",
      iconUrl: initial?.iconUrl ?? "",
      logoUrl: initial?.logoUrl ?? "",
      coverImageUrl: initial?.coverImageUrl ?? "",
      primaryColor: initial?.primaryColor ?? "#1d4ed8",
      secondaryColor: initial?.secondaryColor ?? "#0f172a",
      theme: (initial?.theme ?? "system") as BrandingInput["theme"],
    },
  });

  const onSubmit = async (data: BrandingInput) => {
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ branding: data }),
      });
      setMessage({ tone: "success", text: "Identidad guardada." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="i-name">Nombre</Label>
        <Input id="i-name" aria-invalid={!!errors.name} {...register("name")} />
        <FieldError id="i-name-error" message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="i-shortName">Nombre corto</Label>
        <Input id="i-shortName" aria-invalid={!!errors.shortName} {...register("shortName")} />
        <FieldError id="i-shortName-error" message={errors.shortName?.message} />
      </div>
      <div>
        <Label htmlFor="i-description">Descripción breve</Label>
        <Textarea id="i-description" rows={2} aria-invalid={!!errors.description} {...register("description")} />
        <FieldError id="i-description-error" message={errors.description?.message} />
      </div>
      <div>
        <Label htmlFor="i-fullDescription">Descripción completa</Label>
        <Textarea id="i-fullDescription" rows={4} aria-invalid={!!errors.fullDescription} {...register("fullDescription")} />
        <FieldError id="i-fullDescription-error" message={errors.fullDescription?.message} />
      </div>
      <div>
        <Label htmlFor="i-targetAudience">Público objetivo</Label>
        <Input id="i-targetAudience" aria-invalid={!!errors.targetAudience} {...register("targetAudience")} />
        <FieldError id="i-targetAudience-error" message={errors.targetAudience?.message} />
      </div>
      <div>
        <Label htmlFor="i-iconUrl">URL del icono</Label>
        <Input id="i-iconUrl" placeholder="https://..." aria-invalid={!!errors.iconUrl} {...register("iconUrl")} />
        <FieldError id="i-iconUrl-error" message={errors.iconUrl?.message} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="i-primaryColor">Color primario</Label>
          <Input id="i-primaryColor" type="color" aria-invalid={!!errors.primaryColor} {...register("primaryColor")} />
          <FieldError id="i-primaryColor-error" message={errors.primaryColor?.message} />
        </div>
        <div>
          <Label htmlFor="i-secondaryColor">Color secundario</Label>
          <Input id="i-secondaryColor" type="color" aria-invalid={!!errors.secondaryColor} {...register("secondaryColor")} />
          <FieldError id="i-secondaryColor-error" message={errors.secondaryColor?.message} />
        </div>
      </div>
      <div>
        <Label htmlFor="i-theme">Tema</Label>
        <select
          id="i-theme"
          {...register("theme")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="system">Automático</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>
      <Button type="submit" loading={isSubmitting} className="self-start">
        Guardar identidad
      </Button>
    </form>
  );
}
