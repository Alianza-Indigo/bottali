"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function RunSuiteButton({ suiteId, toolVersionId }: { suiteId: string; toolVersionId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await apiPost(`/api/v1/admin/evaluations/${suiteId}/run`, { toolVersionId });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible ejecutar la suite.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button size="sm" loading={running} onClick={run} className="self-start">
        Ejecutar suite
      </Button>
    </div>
  );
}
