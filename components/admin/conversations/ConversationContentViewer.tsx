"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { FieldError } from "@/components/ui/FieldError";
import { EmptyState } from "@/components/ui/EmptyState";

interface MinimalMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

/**
 * §30 exceptional content access: reading a conversation's actual message content is gated
 * separately from viewing its metadata (conversations.content.read vs .metadata.read), always
 * requires a typed reason, and is recorded on the audit log. Nothing here fetches content on
 * page load — the admin must explicitly request it every time, and the request is real
 * (round-trips to the server, which re-checks the permission and writes the audit event; this
 * is not a client-side reveal of already-fetched data).
 */
export function ConversationContentViewer({ conversationId, canReadContent }: { conversationId: string; canReadContent: boolean }) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MinimalMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canReadContent) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-ink">Contenido de los mensajes</h2>
        </CardHeader>
        <CardBody>
          <Alert tone="info">No tienes el permiso &quot;conversations.content.read&quot; necesario para ver el contenido de esta conversación.</Alert>
        </CardBody>
      </Card>
    );
  }

  const requestContent = async () => {
    setReasonError(null);
    if (reason.trim().length < 10) {
      setReasonError("El motivo debe tener al menos 10 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ messages: MinimalMessage[] }>(`/api/v1/admin/conversations/${conversationId}/content`, { reason });
      setMessages(result.messages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible obtener el contenido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-ink">Contenido de los mensajes</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Alert tone="warning">
          Acceder al contenido de una conversación es una acción excepcional: requiere un motivo, queda registrada en la
          auditoría (§30) y solo debe usarse cuando sea estrictamente necesario (soporte, seguridad, cumplimiento legal).
        </Alert>
        {error && <Alert tone="danger">{error}</Alert>}
        {messages === null ? (
          <>
            <div>
              <Label htmlFor="content-reason">Motivo del acceso</Label>
              <Textarea
                id="content-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: revisión de una denuncia de abuso reportada por el usuario X."
              />
              <FieldError id="content-reason-error" message={reasonError ?? undefined} />
            </div>
            <Button size="sm" variant="danger" loading={loading} onClick={requestContent} className="self-start">
              Ver contenido (se registrará el motivo)
            </Button>
          </>
        ) : messages.length === 0 ? (
          <EmptyState title="Esta conversación no tiene mensajes." />
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded border border-border bg-surface-subtle p-2 text-sm">
                <p className="text-xs font-medium text-ink-faint">
                  {m.role} · {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-ink">{m.content || <span className="italic text-ink-faint">(sin contenido)</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
