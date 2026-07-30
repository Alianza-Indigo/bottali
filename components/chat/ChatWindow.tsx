"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPost, csrfHeaders } from "@/lib/api/client";
import { readNdjsonStream } from "@/lib/chat/stream-reader";
import { clearDraft, loadDraft, saveDraft } from "@/lib/chat/drafts";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { VoiceRecorderButton } from "./VoiceRecorderButton";
import { VoicePlaybackButton } from "./VoicePlaybackButton";
import type { ToolChatInfo } from "./ChatPageClient";

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: string;
  createdAt: string;
  attachedFileIds?: string[];
  generatedFileIds?: string[];
}

interface StagedFile {
  id: string;
  name: string;
  mimeType: string;
}

interface FileMeta {
  originalName: string;
  mimeType: string;
}

interface GeneratedFileMeta {
  title: string;
  mimeType: string;
}

interface PendingToolConfirmation {
  id: string;
  toolName: string;
  argumentsJson: string;
  expiresAt: string;
}

interface ConversationQueryData {
  messages: MessageRow[];
  pendingToolConfirmation: PendingToolConfirmation | null;
}

export function ChatWindow({
  conversationId,
  tool,
  onRenamed,
  onArchivedOrDeleted,
}: {
  conversationId: string;
  tool: ToolChatInfo;
  onRenamed: (title: string) => void;
  onArchivedOrDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const conversationQueryKey = ["conversation", conversationId] as const;
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [resolvingConfirmation, setResolvingConfirmation] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<Record<string, FileMeta>>({});
  const [generatedFileMeta, setGeneratedFileMeta] = useState<Record<string, GeneratedFileMeta>>({});
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TanStack Query (QueryProvider, app/layout.tsx) rather than a bare useEffect+fetch: this
  // conversation's messages+pending-confirmation are a real cacheable server resource,
  // invalidated (not manually re-fetched-and-set) whenever a turn finishes streaming.
  const conversationQuery = useQuery({
    queryKey: conversationQueryKey,
    queryFn: () => apiFetch<ConversationQueryData>(`/api/v1/conversations/${conversationId}`),
  });
  const messages = useMemo(() => conversationQuery.data?.messages ?? [], [conversationQuery.data]);
  const pendingConfirmation = conversationQuery.data?.pendingToolConfirmation ?? null;
  const loading = conversationQuery.isLoading;

  const voicesQuery = useQuery({
    queryKey: ["voices", tool.id],
    queryFn: () =>
      apiFetch<{ voices: VoiceOption[] }>(`/api/v1/voices?toolId=${encodeURIComponent(tool.id)}`).then(
        (res) => res.voices,
      ),
    enabled: tool.capabilities.voiceOutput,
  });
  const voices = voicesQuery.data ?? [];

  /** Re-fetches (rather than trusting the streamed events alone) so the persisted, final
   * shape of the turn — real message ids, generatedFileIds, moderation outcome — replaces
   * the optimistic/streaming view exactly once the server has actually written it. */
  const loadMessages = async () => {
    await queryClient.invalidateQueries({ queryKey: conversationQueryKey, exact: true });
  };

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText]);

  // §22/§36 local drafts: restores whatever was left in the composer for this conversation
  // (IndexedDB, lib/chat/drafts) — e.g. after a reload or a crashed tab — separately from the
  // conversation's actual messages, which come from the query above.
  useEffect(() => {
    let cancelled = false;
    loadDraft(conversationId).then((draft) => {
      if (!cancelled && draft) setInput(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      saveDraft(conversationId, input);
    }, 400);
    return () => clearTimeout(timeout);
  }, [conversationId, input]);

  useEffect(() => {
    setFormValues({});
  }, [pendingConfirmation?.id]);

  // Lazily fetches display metadata (name, mime type) for attachments referenced by their
  // file id on any loaded message — messages only carry ids, not names, so a first render
  // of a conversation with prior attachments needs one small fetch per not-yet-seen id.
  useEffect(() => {
    const missing = new Set<string>();
    for (const message of messages) {
      for (const id of message.attachedFileIds ?? []) {
        if (!(id in fileMeta)) missing.add(id);
      }
    }
    if (missing.size === 0) return;
    let cancelled = false;
    Promise.all(
      [...missing].map((id) =>
        apiFetch<{ file: FileMeta }>(`/api/v1/files/${id}`)
          .then((res) => [id, res.file] as const)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, FileMeta> = {};
      for (const entry of results) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (Object.keys(next).length > 0) setFileMeta((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [messages, fileMeta]);

  // Same lazy-fetch pattern as attachedFileIds, for documents the assistant generated
  // (§17/§36 generate_text_document) — messages only carry ids, not titles.
  useEffect(() => {
    const missing = new Set<string>();
    for (const message of messages) {
      for (const id of message.generatedFileIds ?? []) {
        if (!(id in generatedFileMeta)) missing.add(id);
      }
    }
    if (missing.size === 0) return;
    let cancelled = false;
    Promise.all(
      [...missing].map((id) =>
        apiFetch<{ file: GeneratedFileMeta }>(`/api/v1/generated-files/${id}`)
          .then((res) => [id, res.file] as const)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, GeneratedFileMeta> = {};
      for (const entry of results) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (Object.keys(next).length > 0) setGeneratedFileMeta((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [messages, generatedFileMeta]);

  /** Shared by "send" and "regenerate": both POST to a route that streams NDJSON events. */
  async function runStream(url: string, body?: unknown) {
    setError(null);
    setIsGenerating(true);
    setStreamingText("");
    setLiveStatus("Generando respuesta...");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json", ...csrfHeaders() } : csrfHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.error?.message ?? "No fue posible generar la respuesta.");
      }
      let finalText = "";
      for await (const event of readNdjsonStream(res)) {
        if (event.type === "delta") {
          finalText += event.text;
          setStreamingText(finalText);
        } else if (event.type === "blocked") {
          finalText = event.reason;
          setStreamingText(finalText);
          setLiveStatus("Respuesta bloqueada por políticas de seguridad.");
        } else if (event.type === "error") {
          setError(event.message);
        } else if (event.type === "confirmation_required") {
          // The turn paused mid-generation — no assistant message exists yet, so there's
          // nothing to show in the transcript besides the approve/reject card itself.
          setLiveStatus("El asistente solicita aprobación para usar una herramienta.");
        } else if (event.type === "done") {
          setLiveStatus(event.finishReason === "cancelled" ? "Generación cancelada." : "Respuesta completa.");
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Error inesperado al generar la respuesta.");
      }
    } finally {
      setIsGenerating(false);
      setStreamingText(null);
      abortRef.current = null;
      await loadMessages();
    }
  }

  const sendMessage = async (content: string) => {
    if (!content.trim() || isGenerating) return;
    const attachedFileIds = stagedFiles.map((f) => f.id);
    queryClient.setQueryData<ConversationQueryData>(conversationQueryKey, (old) =>
      old
        ? {
            ...old,
            messages: [
              ...old.messages,
              {
                id: `optimistic-${Date.now()}`,
                role: "user",
                content,
                status: "COMPLETED",
                createdAt: new Date().toISOString(),
                attachedFileIds,
              },
            ],
          }
        : old,
    );
    setInput("");
    setStagedFiles([]);
    await clearDraft(conversationId);
    await runStream(`/api/v1/conversations/${conversationId}/messages`, {
      content,
      ...(attachedFileIds.length > 0 ? { attachedFileIds } : {}),
    });
  };

  const uploadFile = async (file: File) => {
    setUploadError(null);
    setUploadingFile(true);
    try {
      const { fileId } = await apiPost<{ fileId: string }>("/api/v1/files", {
        toolId: tool.id,
        conversationId,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const bytes = await file.arrayBuffer();
      const res = await fetch(`/api/v1/files/${fileId}/upload-complete`, { method: "POST", headers: csrfHeaders(), body: bytes });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "No fue posible completar la carga del archivo.");
      }
      setStagedFiles((prev) => [...prev, { id: fileId, name: file.name, mimeType: file.type }]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No fue posible subir el archivo.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const escalate = async () => {
    if (escalating || escalated) return;
    setEscalating(true);
    try {
      await apiPost(`/api/v1/conversations/${conversationId}/escalate`);
      setEscalated(true);
    } catch {
      setUploadError("No fue posible escalar la conversación. Intenta de nuevo.");
    } finally {
      setEscalating(false);
    }
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?conversation=${conversationId}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const regenerate = async (assistantMessageId: string) => {
    if (isGenerating) return;
    await runStream(`/api/v1/messages/${assistantMessageId}/regenerate`);
  };

  const resolveConfirmation = async (decision: "approve" | "reject", formAnswers?: Record<string, string>) => {
    if (!pendingConfirmation || resolvingConfirmation) return;
    setResolvingConfirmation(true);
    queryClient.setQueryData<ConversationQueryData>(conversationQueryKey, (old) =>
      old ? { ...old, pendingToolConfirmation: null } : old,
    );
    try {
      await runStream(
        `/api/v1/conversations/${conversationId}/tool-confirmations/${pendingConfirmation.id}/${decision}`,
        formAnswers ? { formAnswers } : undefined,
      );
    } finally {
      setResolvingConfirmation(false);
    }
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
  };

  const rename = async () => {
    const title = window.prompt("Nuevo nombre para la conversación:");
    if (!title) return;
    await apiFetch(`/api/v1/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ title }) });
    onRenamed(title);
  };

  const archive = async () => {
    await apiPost(`/api/v1/conversations/${conversationId}/archive`);
    onArchivedOrDeleted();
  };

  const remove = async () => {
    if (!window.confirm("¿Eliminar esta conversación? Esta acción no se puede deshacer desde la interfaz.")) return;
    await apiDelete(`/api/v1/conversations/${conversationId}`);
    onArchivedOrDeleted();
  };

  const exportConversation = async () => {
    const data = await apiPost<{ conversation: unknown; messages: unknown }>(`/api/v1/conversations/${conversationId}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversacion-${conversationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendFeedback = async (messageId: string, rating: "up" | "down") => {
    await apiPost(`/api/v1/messages/${messageId}/feedback`, { rating });
  };

  const lastAssistantMessageId = [...messages].reverse().find((m) => m.role === "assistant" && m.status === "COMPLETED")?.id;

  return (
    <Card className="flex h-[75vh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-medium text-ink">{tool.name}</p>
          <p className="text-xs text-ink-faint">Las respuestas son generadas por inteligencia artificial.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={rename}>
            Renombrar
          </Button>
          {tool.capabilities.exportEnabled && (
            <Button size="sm" variant="ghost" onClick={exportConversation}>
              Exportar
            </Button>
          )}
          {tool.capabilities.escalation && (
            <Button size="sm" variant="ghost" loading={escalating} disabled={escalated} onClick={escalate}>
              {escalated ? "Escalada" : "Escalar a humano"}
            </Button>
          )}
          {tool.capabilities.deepLinks && (
            <Button size="sm" variant="ghost" onClick={copyShareLink}>
              {linkCopied ? "¡Copiado!" : "Compartir"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={archive}>
            Archivar
          </Button>
          <Button size="sm" variant="ghost" onClick={remove}>
            Eliminar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tool.scopeNotice && (
          <Alert tone="info" className="mb-4">
            {tool.scopeNotice}
          </Alert>
        )}
        {loading ? (
          <p className="text-sm text-ink-muted">Cargando conversación...</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">{tool.welcomeMessage}</p>
            {tool.capabilities.quickReplies && tool.suggestedQuestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tool.suggestedQuestions.map((q) => (
                  <Button key={q} size="sm" variant="secondary" onClick={() => sendMessage(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((message) => (
              <li key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    message.role === "user"
                      ? "inline-block max-w-[80%] rounded-lg bg-brand px-3 py-2 text-sm text-brand-fg"
                      : "inline-block max-w-[80%] rounded-lg bg-surface-subtle px-3 py-2 text-sm text-ink"
                  }
                >
                  {message.content || <span className="italic text-ink-faint">(sin contenido)</span>}
                </div>
                {tool.capabilities.files && (message.attachedFileIds?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap justify-end gap-2">
                    {message.attachedFileIds!.map((fileId) => {
                      const meta = fileMeta[fileId];
                      const isImage = tool.capabilities.images && meta?.mimeType.startsWith("image/");
                      return isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={fileId}
                          src={`/api/v1/files/${fileId}/download`}
                          alt={meta?.originalName ?? "Imagen adjunta"}
                          className="max-h-40 rounded border border-border"
                        />
                      ) : (
                        <a
                          key={fileId}
                          href={`/api/v1/files/${fileId}/download`}
                          className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs text-ink underline"
                        >
                          {meta?.originalName ?? "Archivo adjunto"}
                        </a>
                      );
                    })}
                  </div>
                )}
                {(message.generatedFileIds?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap justify-start gap-2">
                    {message.generatedFileIds!.map((fileId) => (
                      <a
                        key={fileId}
                        href={`/api/v1/generated-files/${fileId}/download`}
                        className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs text-ink underline"
                      >
                        {generatedFileMeta[fileId]?.title ?? "Documento generado"}
                      </a>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && message.status === "COMPLETED" && (
                  <div className="mt-1 flex justify-start gap-3">
                    {tool.capabilities.feedback && (
                      <>
                        <button
                          type="button"
                          aria-label="Respuesta útil"
                          onClick={() => sendFeedback(message.id, "up")}
                          className="text-xs text-ink-faint hover:text-success"
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          aria-label="Respuesta no útil"
                          onClick={() => sendFeedback(message.id, "down")}
                          className="text-xs text-ink-faint hover:text-danger"
                        >
                          👎
                        </button>
                      </>
                    )}
                    {message.id === lastAssistantMessageId && !isGenerating && (
                      <button
                        type="button"
                        onClick={() => regenerate(message.id)}
                        className="text-xs text-ink-faint underline hover:text-ink"
                      >
                        Regenerar
                      </button>
                    )}
                  </div>
                )}
                {message.role === "assistant" && message.status === "COMPLETED" && tool.capabilities.voiceOutput && voices.length > 0 && (
                  <VoicePlaybackButton toolId={tool.id} text={message.content} voices={voices} />
                )}
              </li>
            ))}
            {streamingText !== null && (
              <li className="text-left">
                <div className="inline-block max-w-[80%] rounded-lg bg-surface-subtle px-3 py-2 text-sm text-ink">
                  {streamingText || <span className="italic text-ink-faint">Generando…</span>}
                </div>
              </li>
            )}
          </ul>
        )}
        {pendingConfirmation && pendingConfirmation.toolName === "collect_form_input" ? (
          (() => {
            let form: { fields: Array<{ name: string; label: string; type?: string }>; prompt?: string } | null = null;
            try {
              form = JSON.parse(pendingConfirmation.argumentsJson);
            } catch {
              form = null;
            }
            return (
              <Alert tone="info" className="mt-4" data-testid="tool-confirmation-card">
                <p className="font-medium">{form?.prompt || "El asistente necesita algunos datos"}</p>
                {form?.fields ? (
                  <form
                    className="mt-2 flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      resolveConfirmation("approve", formValues);
                    }}
                  >
                    {form.fields.map((field) => (
                      <div key={field.name}>
                        <Label htmlFor={`form-field-${field.name}`}>{field.label}</Label>
                        <Input
                          id={`form-field-${field.name}`}
                          type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
                          value={formValues[field.name] ?? ""}
                          onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="mt-1 flex gap-2">
                      <Button type="submit" size="sm" loading={resolvingConfirmation}>
                        Enviar
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => resolveConfirmation("reject")} loading={resolvingConfirmation}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-1 text-xs text-danger">No fue posible mostrar este formulario.</p>
                )}
              </Alert>
            );
          })()
        ) : (
          pendingConfirmation && (
            <Alert tone="warning" className="mt-4" data-testid="tool-confirmation-card">
              <p className="font-medium">El asistente quiere usar una herramienta</p>
              <p className="mt-1 text-ink-muted">
                Herramienta: <span className="font-mono">{pendingConfirmation.toolName}</span>
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-surface-subtle p-2 text-xs text-ink-muted">
                {pendingConfirmation.argumentsJson}
              </pre>
              <p className="mt-1 text-xs text-ink-faint">
                Puedes seguir escribiendo otros mensajes; esta solicitud vence sola si no respondes.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => resolveConfirmation("approve")} loading={resolvingConfirmation}>
                  Aprobar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => resolveConfirmation("reject")} loading={resolvingConfirmation}>
                  Rechazar
                </Button>
              </div>
            </Alert>
          )
        )}
        <div ref={listEndRef} />
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </div>

      {error && (
        <Alert tone="danger" className="mx-4 mb-2">
          {error}
        </Alert>
      )}

      {tool.capabilities.menus && tool.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2">
          {tool.suggestedQuestions.map((q) => (
            <Button key={q} size="sm" variant="secondary" disabled={isGenerating} onClick={() => sendMessage(q)}>
              {q}
            </Button>
          ))}
        </div>
      )}

      {uploadError && (
        <Alert tone="danger" className="mx-4 mb-2">
          {uploadError}
        </Alert>
      )}

      {tool.capabilities.files && stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2">
          {stagedFiles.map((f) => (
            <span key={f.id} className="flex items-center gap-1 rounded border border-border bg-surface-subtle px-2 py-1 text-xs text-ink">
              {f.name}
              <button
                type="button"
                aria-label={`Quitar ${f.name}`}
                onClick={() => removeStagedFile(f.id)}
                className="text-ink-faint hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Escribe un mensaje
        </label>
        <Textarea
          id="chat-input"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Escribe tu mensaje..."
          className="flex-1"
          disabled={isGenerating}
        />
        {tool.capabilities.files && (
          <>
            <label htmlFor="chat-file-input" className="sr-only">
              Adjuntar archivo
            </label>
            <input
              ref={fileInputRef}
              id="chat-file-input"
              type="file"
              accept={tool.capabilities.images ? "image/png,image/jpeg,.pdf,.docx,.txt,.md,.html" : ".pdf,.docx,.txt,.md,.html"}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
            />
            <Button
              type="button"
              size="md"
              variant="secondary"
              loading={uploadingFile}
              disabled={isGenerating}
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </Button>
          </>
        )}
        {tool.capabilities.voiceInput && (
          <VoiceRecorderButton
            toolId={tool.id}
            disabled={isGenerating}
            onTranscribed={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
          />
        )}
        {isGenerating ? (
          <Button type="button" variant="secondary" onClick={cancelGeneration}>
            Cancelar
          </Button>
        ) : (
          <Button type="submit">Enviar</Button>
        )}
      </form>
    </Card>
  );
}
