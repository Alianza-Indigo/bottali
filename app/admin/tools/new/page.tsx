"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createToolSchema, type CreateToolInput } from "@/lib/validation/tools";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FieldError } from "@/components/ui/FieldError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function NewToolPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateToolInput>({ resolver: zodResolver(createToolSchema) });

  const onSubmit = async (data: CreateToolInput) => {
    setServerError(null);
    try {
      const result = await apiPost<{ toolId: string }>("/api/v1/admin/tools", data);
      router.push(`/admin/tools/${result.toolId}`);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Ocurrió un error inesperado.");
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-ink">Crear herramienta</h1>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError id="name-error" message={errors.name?.message} />
            </div>
            <div>
              <Label htmlFor="shortName">Nombre corto</Label>
              <Input id="shortName" aria-invalid={!!errors.shortName} {...register("shortName")} />
              <FieldError id="shortName-error" message={errors.shortName?.message} />
            </div>
            <div>
              <Label htmlFor="slug">Slug (identificador en URL)</Label>
              <Input id="slug" placeholder="mi-herramienta" aria-invalid={!!errors.slug} {...register("slug")} />
              <FieldError id="slug-error" message={errors.slug?.message} />
            </div>
            <div>
              <Label htmlFor="description">Descripción breve</Label>
              <Textarea id="description" rows={3} aria-invalid={!!errors.description} {...register("description")} />
              <FieldError id="description-error" message={errors.description?.message} />
            </div>
            <div>
              <Label htmlFor="category">Categoría (opcional)</Label>
              <Input id="category" aria-invalid={!!errors.category} {...register("category")} />
              <FieldError id="category-error" message={errors.category?.message} />
            </div>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Crear herramienta
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
