"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";

export function HistoryConversationRow({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const restore = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/v1/conversations/${id}/restore`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-ink">{title}</span>
      <Button size="sm" variant="secondary" loading={loading} onClick={restore}>
        Restaurar
      </Button>
    </li>
  );
}
