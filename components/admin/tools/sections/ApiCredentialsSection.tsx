"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, PlugZap, Save, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface ProviderOption {
  id: string;
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
}

interface CredentialSummary {
  providerId: string;
  keyHint: string;
  baseUrl: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
}

const SUPPORTED_PROVIDER_KEYS = new Set(["llm:gemini", "llm:openai-compatible"]);

function ProviderCredentialRow({
  toolId,
  provider,
  credential,
  onChanged,
}: {
  toolId: string;
  provider: ProviderOption;
  credential: CredentialSummary | null;
  onChanged: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    credential?.baseUrl ?? (provider.key === "llm:openai-compatible" ? "https://api.openai.com/v1" : ""),
  );
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const endpoint = `/api/v1/admin/tools/${toolId}/credentials/${provider.id}`;

  async function refreshModels() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "models", toolId] });
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify({
          ...(apiKey ? { apiKey } : {}),
          ...(provider.key === "llm:openai-compatible" ? { baseUrl } : {}),
        }),
      });
      setApiKey("");
      await Promise.all([onChanged(), refreshModels()]);
      setMessage({ tone: "success", text: "Credencial guardada y cifrada." });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof ApiError ? error.message : "No fue posible guardar la credencial.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setMessage(null);
    try {
      const result = await apiFetch<{ health: { healthy: boolean; message?: string } }>(
        `${endpoint}/test`,
        { method: "POST" },
      );
      await onChanged();
      setMessage({
        tone: result.health.healthy ? "success" : "danger",
        text: result.health.healthy
          ? "Conexión verificada."
          : result.health.message || "El proveedor rechazó la conexión.",
      });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof ApiError ? error.message : "No fue posible probar la conexión.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar la credencial de ${provider.name}?`)) return;
    setBusy("delete");
    setMessage(null);
    try {
      await apiFetch(endpoint, { method: "DELETE" });
      setApiKey("");
      await Promise.all([onChanged(), refreshModels()]);
      setMessage({ tone: "success", text: "Credencial eliminada." });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof ApiError ? error.message : "No fue posible eliminar la credencial.",
      });
    } finally {
      setBusy(null);
    }
  }

  const configured = Boolean(credential);
  const healthy = credential?.lastTestStatus === "healthy";

  return (
    <section className="border-b border-border py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{provider.name}</h3>
          <p className="mt-1 text-xs text-ink-muted">
            {configured ? `Clave ${credential?.keyHint}` : "Sin credencial propia"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configured && (
            <Badge tone={healthy ? "success" : "neutral"}>
              {healthy ? "Verificada" : "Configurada"}
            </Badge>
          )}
          {!configured && provider.enabled && <Badge tone="brand">Respaldo global</Badge>}
        </div>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={provider.key === "llm:openai-compatible" ? "" : "lg:col-span-2"}>
          <Label htmlFor={`api-key-${provider.id}`}>
            {configured ? "Reemplazar clave API" : "Clave API"}
          </Label>
          <div className="flex gap-2">
            <Input
              id={`api-key-${provider.id}`}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={configured ? credential?.keyHint : "Ingresa la clave"}
              autoComplete="new-password"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowKey((value) => !value)}
              title={showKey ? "Ocultar clave" : "Mostrar clave"}
              aria-label={showKey ? "Ocultar clave" : "Mostrar clave"}
              className="w-10 shrink-0 px-0"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </div>
        </div>

        {provider.key === "llm:openai-compatible" && (
          <div>
            <Label htmlFor={`base-url-${provider.id}`}>URL base</Label>
            <Input
              id={`base-url-${provider.id}`}
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={save}
          loading={busy === "save"}
          disabled={Boolean(busy) || (!configured && !apiKey)}
        >
          <Save size={16} />
          Guardar
        </Button>
        {configured && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={testConnection}
              loading={busy === "test"}
              disabled={Boolean(busy)}
            >
              {healthy ? <CheckCircle2 size={16} /> : <PlugZap size={16} />}
              Probar conexión
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              loading={busy === "delete"}
              disabled={Boolean(busy)}
            >
              <Trash2 size={16} />
              Eliminar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function ApiCredentialsSection({
  toolId,
  providers,
  initialCredentials,
}: {
  toolId: string;
  providers: ProviderOption[];
  initialCredentials: CredentialSummary[];
}) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const supportedProviders = providers.filter(
    (provider) => provider.kind === "llm" && SUPPORTED_PROVIDER_KEYS.has(provider.key),
  );

  async function refresh() {
    const result = await apiFetch<{ credentials: CredentialSummary[] }>(
      `/api/v1/admin/tools/${toolId}/credentials`,
    );
    setCredentials(result.credentials);
  }

  return (
    <div>
      {supportedProviders.map((provider) => (
        <ProviderCredentialRow
          key={provider.id}
          toolId={toolId}
          provider={provider}
          credential={
            credentials.find((credential) => credential.providerId === provider.id) ?? null
          }
          onChanged={refresh}
        />
      ))}
    </div>
  );
}
