"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function DataActions() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestExport = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const { requestId } = await apiPost<{ requestId: string }>("/api/v1/me/export");
      window.location.href = `/api/v1/me/export/${requestId}`;
      setExportMessage("Tu exportación se generó y comenzó a descargarse.");
    } catch {
      setExportMessage("No fue posible generar la exportación en este momento.");
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    if (!window.confirm("¿Solicitar la eliminación de tu cuenta? Se cerrará tu sesión inmediatamente.")) return;
    setDeleting(true);
    try {
      await apiFetch("/api/v1/me", { method: "DELETE" });
      router.push("/login");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {exportMessage && <Alert tone="info">{exportMessage}</Alert>}
      <Button variant="secondary" loading={exporting} onClick={requestExport} className="self-start">
        Exportar mis datos
      </Button>
      <Button variant="danger" loading={deleting} onClick={requestDeletion} className="self-start">
        Solicitar eliminación de cuenta
      </Button>
    </div>
  );
}
