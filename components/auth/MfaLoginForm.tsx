"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost } from "@/lib/api/client";

export function MfaLoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost("/api/v1/auth/mfa/login-verify", { code: code.trim() });
      router.replace(destination);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "No fue posible verificar el código.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Código de autenticación
        <Input
          autoComplete="one-time-code"
          autoFocus
          inputMode="numeric"
          maxLength={64}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Código TOTP o de recuperación"
          required
          value={code}
        />
      </label>
      <Button loading={loading} type="submit">
        Verificar
      </Button>
    </form>
  );
}
