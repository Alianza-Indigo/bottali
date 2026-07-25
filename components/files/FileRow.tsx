"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiDelete } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function FileRow({
  id,
  originalName,
  sizeLabel,
  status,
}: {
  id: string;
  originalName: string;
  sizeLabel: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const remove = async () => {
    if (!window.confirm(`¿Eliminar "${originalName}"?`)) return;
    setLoading(true);
    try {
      await apiDelete(`/api/v1/files/${id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="text-sm text-ink">{originalName}</p>
        <p className="text-xs text-ink-faint">{sizeLabel}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status === "VALIDATED" ? "success" : status === "REJECTED" ? "danger" : "neutral"}>{status}</Badge>
        {status === "VALIDATED" && (
          <a href={`/api/v1/files/${id}/download`} className="text-sm text-brand underline">
            Descargar
          </a>
        )}
        <Button size="sm" variant="ghost" loading={loading} onClick={remove}>
          Eliminar
        </Button>
      </div>
    </li>
  );
}
