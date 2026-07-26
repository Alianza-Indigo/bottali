"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { FieldError } from "@/components/ui/FieldError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      await apiPost("/api/v1/auth/register", data);
      setSuccess(true);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Ocurrió un error inesperado.");
    }
  };

  if (success) {
    return (
      <Card>
        <CardBody>
          <Alert tone="success">Tu cuenta fue creada. Ya puedes iniciar sesión.</Alert>
          <Link href="/login" className="mt-4 inline-block text-sm underline">
            Iniciar sesión
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Crear cuenta</h1>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <div>
            <Label htmlFor="displayName">Nombre</Label>
            <Input id="displayName" autoComplete="name" aria-invalid={!!errors.displayName} {...register("displayName")} />
            <FieldError id="displayName-error" message={errors.displayName?.message} />
          </div>
          <div>
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
            <FieldError id="email-error" message={errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
            <FieldError id="password-error" message={errors.password?.message} />
            <p className="mt-1 text-xs text-ink-muted">Mínimo 10 caracteres, con mayúscula, minúscula y número.</p>
          </div>
          <div className="flex items-start gap-2">
            <input
              id="acceptedPrivacyPolicy"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border-strong"
              {...register("acceptedPrivacyPolicy")}
            />
            <Label htmlFor="acceptedPrivacyPolicy" className="mb-0 font-normal">
              Acepto el aviso de privacidad.
            </Label>
          </div>
          <FieldError id="privacy-error" message={errors.acceptedPrivacyPolicy?.message} />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Crear cuenta
          </Button>
          <Link href="/login" className="text-center text-sm text-ink-muted underline">
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </form>
      </CardBody>
    </Card>
  );
}
