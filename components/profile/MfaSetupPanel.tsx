"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";

type Step = "status" | "setup" | "recovery";

export function MfaSetupPanel({ initialEnabled, requiredForAdmin }: { initialEnabled: boolean; requiredForAdmin: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("status");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ secret: string; otpauthUrl: string }>("/api/v1/auth/mfa/setup");
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
      setStep("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible iniciar la configuración.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/verify", { code });
      setRecoveryCodes(res.recoveryCodes);
      setEnabled(true);
      setStep("recovery");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!window.confirm("¿Desactivar la verificación en dos pasos?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/v1/auth/mfa/disable");
      setEnabled(false);
      setStep("status");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible desactivar MFA.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "recovery") {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <Alert tone="success">Verificación en dos pasos activada.</Alert>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              Guarda estos códigos de recuperación en un lugar seguro. Cada uno solo funciona una vez, si pierdes acceso a tu
              aplicación de autenticación.
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded border border-border bg-surface-subtle p-3 font-mono text-sm">
              {recoveryCodes.map((rc) => (
                <li key={rc}>{rc}</li>
              ))}
            </ul>
          </div>
          <Button onClick={() => router.push(requiredForAdmin ? "/admin" : "/profile")}>Continuar</Button>
        </CardBody>
      </Card>
    );
  }

  if (step === "setup") {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-sm text-ink-muted">
            Escanea este código con tu aplicación de autenticación (Google Authenticator, Authy, 1Password, etc.), o ingresa la
            clave manualmente.
          </p>
          <div className="rounded border border-border bg-surface-subtle p-3">
            <p className="text-xs text-ink-faint">Clave manual</p>
            <p className="break-all font-mono text-sm">{secret}</p>
            <p className="mt-2 text-xs text-ink-faint">URL otpauth</p>
            <p className="break-all font-mono text-xs">{otpauthUrl}</p>
          </div>
          <form onSubmit={confirmSetup} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="mfa-setup-code">Código de 6 dígitos</Label>
              <Input id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button type="submit" loading={busy} className="self-start">
              Confirmar y activar
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {requiredForAdmin && !enabled && (
          <Alert tone="warning">Es obligatorio activar la verificación en dos pasos para acceder al panel administrativo.</Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-ink-muted">
          {enabled
            ? "La verificación en dos pasos está activada en tu cuenta."
            : "Añade una capa extra de seguridad pidiendo un código de tu teléfono además de tu contraseña."}
        </p>
        {enabled ? (
          <Button variant="danger" onClick={disable} loading={busy} className="self-start">
            Desactivar
          </Button>
        ) : (
          <Button onClick={startSetup} loading={busy} className="self-start">
            Activar verificación en dos pasos
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
