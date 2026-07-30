"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Save, Trash2, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

type AuthType = "bearer" | "api_key" | "basic" | "oauth2_client_credentials";

interface ExternalCredential {
  id: string;
  name: string;
  authType: AuthType;
  keyHint: string;
  config: {
    headerName?: string;
    username?: string;
    clientId?: string;
    tokenUrl?: string;
    scope?: string;
  };
  updatedAt: string;
}

const AUTH_LABELS: Record<AuthType, string> = {
  bearer: "Bearer token",
  api_key: "API key",
  basic: "Basic Auth",
  oauth2_client_credentials: "OAuth2 Client Credentials",
};

export function ExternalCredentialsManager({ toolId }: { toolId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "tools", toolId, "external-credentials"];
  const { data = [] } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<{ credentials: ExternalCredential[] }>(
        `/api/v1/admin/tools/${toolId}/external-credentials`,
      ).then((result) => result.credentials),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [authType, setAuthType] = useState<AuthType>("bearer");
  const [secret, setSecret] = useState("");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [username, setUsername] = useState("");
  const [clientId, setClientId] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  function reset() {
    setEditingId(null);
    setName("");
    setAuthType("bearer");
    setSecret("");
    setHeaderName("X-API-Key");
    setUsername("");
    setClientId("");
    setTokenUrl("");
    setScope("");
  }

  function edit(credential: ExternalCredential) {
    setEditingId(credential.id);
    setName(credential.name);
    setAuthType(credential.authType);
    setSecret("");
    setHeaderName(credential.config.headerName || "X-API-Key");
    setUsername(credential.config.username || "");
    setClientId(credential.config.clientId || "");
    setTokenUrl(credential.config.tokenUrl || "");
    setScope(credential.config.scope || "");
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const endpoint = editingId
        ? `/api/v1/admin/tools/${toolId}/external-credentials/${editingId}`
        : `/api/v1/admin/tools/${toolId}/external-credentials`;
      await apiFetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          authType,
          ...(secret ? { secret } : {}),
          ...(authType === "api_key" ? { headerName } : {}),
          ...(authType === "basic" ? { username } : {}),
          ...(authType === "oauth2_client_credentials"
            ? { clientId, tokenUrl, scope: scope || undefined }
            : {}),
        }),
      });
      await queryClient.invalidateQueries({ queryKey });
      reset();
      setMessage({ tone: "success", text: "Credencial externa guardada." });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof ApiError ? error.message : "No fue posible guardar la credencial.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(credential: ExternalCredential) {
    if (!window.confirm(`¿Eliminar la credencial ${credential.name}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(
        `/api/v1/admin/tools/${toolId}/external-credentials/${credential.id}`,
        { method: "DELETE" },
      );
      await queryClient.invalidateQueries({ queryKey });
      if (editingId === credential.id) reset();
      setMessage({ tone: "success", text: "Credencial externa eliminada." });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof ApiError ? error.message : "No fue posible eliminar la credencial.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound size={18} className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">Credenciales para APIs externas</h3>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {data.length > 0 && (
        <div className="mt-4 divide-y divide-border border-y border-border">
          {data.map((credential) => (
            <div key={credential.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{credential.name}</p>
                <p className="text-xs text-ink-muted">
                  {AUTH_LABELS[credential.authType]} · {credential.keyHint}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="success">Cifrada</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => edit(credential)}
                  title="Editar credencial"
                  aria-label={`Editar ${credential.name}`}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => remove(credential)}
                  title="Eliminar credencial"
                  aria-label={`Eliminar ${credential.name}`}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <Label htmlFor="external-credential-name">Nombre</Label>
          <Input
            id="external-credential-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="CRM producción"
          />
        </div>
        <div>
          <Label htmlFor="external-auth-type">Autenticación</Label>
          <select
            id="external-auth-type"
            value={authType}
            onChange={(event) => setAuthType(event.target.value as AuthType)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            {Object.entries(AUTH_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {authType === "api_key" && (
          <div>
            <Label htmlFor="external-header-name">Header</Label>
            <Input
              id="external-header-name"
              value={headerName}
              onChange={(event) => setHeaderName(event.target.value)}
            />
          </div>
        )}
        {authType === "basic" && (
          <div>
            <Label htmlFor="external-username">Usuario</Label>
            <Input
              id="external-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        {authType === "oauth2_client_credentials" && (
          <>
            <div>
              <Label htmlFor="external-client-id">Client ID</Label>
              <Input
                id="external-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="external-token-url">URL de token</Label>
              <Input
                id="external-token-url"
                type="url"
                value={tokenUrl}
                onChange={(event) => setTokenUrl(event.target.value)}
                placeholder="https://auth.ejemplo.com/oauth/token"
              />
            </div>
            <div>
              <Label htmlFor="external-scope">Scope</Label>
              <Input
                id="external-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="external-secret">
            {editingId ? "Reemplazar secreto" : authType === "basic" ? "Contraseña" : "Secreto"}
          </Label>
          <Input
            id="external-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={editingId ? "Sin cambios" : ""}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          onClick={save}
          loading={busy}
          disabled={!name || (!editingId && !secret)}
        >
          <Save size={16} />
          {editingId ? "Actualizar" : "Agregar"}
        </Button>
        {editingId && (
          <Button type="button" variant="secondary" onClick={reset} disabled={busy}>
            <X size={16} />
            Cancelar
          </Button>
        )}
      </div>
    </section>
  );
}
