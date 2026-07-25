"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
}

export function NotificationsList({ notifications: initial }: { notifications: NotificationItem[] }) {
  const [items, setItems] = useState(initial);

  const markRead = async (id: string) => {
    await apiPost(`/api/v1/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    await apiPost("/api/v1/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div>
      <div className="flex justify-end px-5 py-2">
        <Button size="sm" variant="ghost" onClick={markAllRead}>
          Marcar todas como leídas
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div>
              <p className="text-sm text-ink">{item.title}</p>
              {item.body && <p className="text-xs text-ink-muted">{item.body}</p>}
            </div>
            {!item.read ? (
              <Button size="sm" variant="ghost" onClick={() => markRead(item.id)}>
                Marcar leída
              </Button>
            ) : (
              <Badge tone="neutral">Leída</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
