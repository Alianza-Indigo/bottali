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

function MfaStep({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost("/api/v1/auth/mfa/login-verify", { code });
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Verificación en dos pasos</h1>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Label htmlFor="mfa-code">Código de tu aplicación de autenticación</Label>
            <Input
              id="mfa-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456 o un código de recuperación"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button type="submit" loading={submitting} className="w-full">
            Verificar
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const goToDestination = () => {
    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  };

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const result = await apiPost<{ mfaRequired?: boolean }>("/api/v1/auth/login", data);
      if (result.mfaRequired) {
        setMfaPending(true);
        return;
      }
      goToDestination();
    } catch (error) {
      if (error instanceof ApiError) setServerError(error.message);
      else setServerError("Ocurrió un error inesperado.");
    }
  };

  if (mfaPending) {
    return <MfaStep onVerified={goToDestination} />;
  }

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
