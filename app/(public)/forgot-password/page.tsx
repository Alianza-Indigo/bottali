"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import type { z } from "zod";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { FieldError } from "@/components/ui/FieldError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setServerError(null);
    try {
      const res = await apiPost<{ message: string }>("/api/v1/auth/forgot-password", data);
      setMessage(res.message);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Ocurrió un error inesperado.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Recuperar acceso</h1>
      </CardHeader>
      <CardBody>
        {message ? (
          <Alert tone="success">{message}</Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <div>
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
              <FieldError id="email-error" message={errors.email?.message} />
            </div>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Enviar instrucciones
            </Button>
          </form>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm underline">
          Volver a iniciar sesión
        </Link>
      </CardBody>
    </Card>
  );
}
