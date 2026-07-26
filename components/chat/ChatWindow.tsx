"use client";

import { useEffect, useRef, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "@/lib/api/client";
import { readNdjsonStream } from "@/lib/chat/stream-reader";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
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
}

interface PendingToolConfirmation {
  id: string;
  toolName: string;
  argumentsJson: string;
  expiresAt: string;
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
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingToolConfirmation | null>(null);
  const [resolvingConfirmation, setResolvingConfirmation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tool.capabilities.voiceOutput) return;
    let cancelled = false;
    apiFetch<{ voices: VoiceOption[] }>("/api/v1/voices").then((res) => {
      if (!cancelled) setVoices(res.voices);
    });
    return () => {
      cancelled = true;
    };
  }, [tool.capabilities.voiceOutput]);

  const loadMessages = async () => {
    const res = await apiFetch<{ messages: MessageRow[]; pendingToolConfirmation: PendingToolConfirmation | null }>(
      `/api/v1/conversations/${conversationId}`,
    );
    setMessages(res.messages);
    setPendingConfirmation(res.pendingToolConfirmation);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ messages: MessageRow[]; pendingToolConfirmation: PendingToolConfirmation | null }>(`/api/v1/conversations/${conversationId}`)
      .then((res) => {
        if (!cancelled) {
          setMessages(res.messages);
          setPendingConfirmation(res.pendingToolConfirmation);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText]);

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
        headers: body ? { "Content-Type": "application/json" } : undefined,
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
    setMessages((prev) => [
      ...prev,
      { id: `optimistic-${Date.now()}`, role: "user", content, status: "COMPLETED", createdAt: new Date().toISOString() },
    ]);
    setInput("");
    await runStream(`/api/v1/conversations/${conversationId}/messages`, { content });
  };

  const regenerate = async (assistantMessageId: string) => {
    if (isGenerating) return;
    await runStream(`/api/v1/messages/${assistantMessageId}/regenerate`);
  };

  const resolveConfirmation = async (decision: "approve" | "reject") => {
    if (!pendingConfirmation || resolvingConfirmation) return;
    setResolvingConfirmation(true);
    setPendingConfirmation(null);
    try {
      await runStream(`/api/v1/conversations/${conversationId}/tool-confirmations/${pendingConfirmation.id}/${decision}`);
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
            {tool.suggestedQuestions.length > 0 && (
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
                  <VoicePlaybackButton text={message.content} voices={voices} />
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
        {pendingConfirmation && (
          <Alert tone="warning" className="mt-4">
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
        {tool.capabilities.voiceInput && (
          <VoiceRecorderButton
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
