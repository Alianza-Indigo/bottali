"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChatWindow } from "./ChatWindow";

export interface ToolChatInfo {
  id: string;
  slug: string;
  name: string;
  welcomeMessage: string;
  scopeNotice: string;
  suggestedQuestions: string[];
  capabilities: { files: boolean; exportEnabled: boolean; feedback: boolean; voiceInput: boolean; voiceOutput: boolean };
}

export interface ConversationSummary {
  id: string;
  title: string;
}

export function ChatPageClient({
  tool,
  initialConversations,
}: {
  tool: ToolChatInfo;
  initialConversations: ConversationSummary[];
}) {
  const [conversationList, setConversationList] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const createConversation = async () => {
    setCreating(true);
    try {
      const { conversation } = await apiPost<{ conversation: { id: string; title: string } }>("/api/v1/conversations", { toolId: tool.id });
      setConversationList((prev) => [{ id: conversation.id, title: conversation.title }, ...prev]);
      setSelectedId(conversation.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
      <aside aria-label="Lista de conversaciones" className="flex flex-col gap-2">
        <Button size="sm" loading={creating} onClick={createConversation}>
          Nueva conversación
        </Button>
        <Card className="max-h-[70vh] overflow-y-auto">
          <ul className="divide-y divide-border">
            {conversationList.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  className="w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-surface-subtle aria-[current=true]:bg-brand-subtle"
                >
                  {conversation.title}
                </button>
              </li>
            ))}
            {conversationList.length === 0 && <li className="px-3 py-4 text-sm text-ink-muted">Sin conversaciones todavía.</li>}
          </ul>
        </Card>
      </aside>
      <section aria-label={`Conversación con ${tool.name}`}>
        {selectedId ? (
          <ChatWindow
            key={selectedId}
            conversationId={selectedId}
            tool={tool}
            onRenamed={(title) =>
              setConversationList((prev) => prev.map((c) => (c.id === selectedId ? { ...c, title } : c)))
            }
            onArchivedOrDeleted={() => {
              setConversationList((prev) => prev.filter((c) => c.id !== selectedId));
              setSelectedId(null);
            }}
          />
        ) : (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-ink-muted">Selecciona una conversación o crea una nueva para empezar.</p>
            <Button loading={creating} onClick={createConversation}>
              Nueva conversación
            </Button>
          </Card>
        )}
      </section>
    </div>
  );
}
