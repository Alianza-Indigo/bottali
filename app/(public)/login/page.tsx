"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { FieldError } from "@/components/ui/FieldError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      await apiPost("/api/v1/auth/login", data);
      router.push(searchParams.get("next") || "/dashboard");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) setServerError(error.message);
      else setServerError("Ocurrió un error inesperado.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Iniciar sesión</h1>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <div>
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
            <FieldError id="email-error" message={errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
            <FieldError id="password-error" message={errors.password?.message} />
          </div>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Iniciar sesión
          </Button>
          <div className="flex justify-between text-sm text-ink-muted">
            <Link href="/forgot-password" className="underline">
              ¿Olvidaste tu contraseña?
            </Link>
            <Link href="/register" className="underline">
              Crear cuenta
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <LoginForm />
    </Suspense>
  );
}
