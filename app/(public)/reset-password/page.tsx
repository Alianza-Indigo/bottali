"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { resetPasswordSchema } from "@/lib/validation/auth";
import type { z } from "zod";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { FieldError } from "@/components/ui/FieldError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token } });

  const onSubmit = async (data: ResetPasswordInput) => {
    setServerError(null);
    try {
      await apiPost("/api/v1/auth/reset-password", data);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Ocurrió un error inesperado.");
    }
  };

  if (!token) {
    return (
      <Card>
        <CardBody>
          <Alert tone="danger">Falta el token de restablecimiento en el enlace.</Alert>
          <Link href="/forgot-password" className="mt-4 inline-block text-sm underline">
            Solicitar un nuevo enlace
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Restablecer contraseña</h1>
      </CardHeader>
      <CardBody>
        {success ? (
          <Alert tone="success">Contraseña actualizada. Redirigiendo a iniciar sesión...</Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <input type="hidden" {...register("token")} />
            <div>
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Restablecer contraseña
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
