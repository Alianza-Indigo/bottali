"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Falta el token de verificación en el enlace.");
      return;
    }
    apiPost<{ message: string }>("/api/v1/auth/verify-email", { token })
      .then((res) => {
        setState("success");
        setMessage(res.message);
      })
      .catch((error) => {
        setState("error");
        setMessage(error instanceof ApiError ? error.message : "No fue posible verificar tu correo.");
      });
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Verificación de correo</h1>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {state === "loading" && <Skeleton className="h-10 w-full" />}
        {state === "success" && <Alert tone="success">{message}</Alert>}
        {state === "error" && <Alert tone="danger">{message}</Alert>}
        <Link href="/login" className="text-sm underline">
          Ir a iniciar sesión
        </Link>
      </CardBody>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
