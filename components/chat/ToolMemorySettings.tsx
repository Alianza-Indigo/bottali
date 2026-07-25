"use client";

import { useState } from "react";
import { apiDelete } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function ToolMemorySettings({ toolId }: { toolId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const clearMemory = async () => {
    setLoading(true);
    try {
      await apiDelete(`/api/v1/catalog/${toolId}/memory`);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {done && <Alert tone="success">Se eliminó la memoria guardada para esta herramienta.</Alert>}
      <Button variant="secondary" size="sm" loading={loading} onClick={clearMemory} className="self-start">
        Eliminar mi memoria en esta herramienta
      </Button>
    </div>
  );
}
