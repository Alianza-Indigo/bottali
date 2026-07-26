"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";

/** Objetivo #29 "Duplicar herramientas existentes" — backend already existed
 * (POST /api/v1/admin/tools/{id}/duplicate) with no UI entry point until now. */
export function DuplicateToolButton({ toolId, sourceSlug }: { toolId: string; sourceSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const duplicate = async () => {
    const slug = window.prompt("Slug para la nueva herramienta duplicada:", `${sourceSlug}-copia`);
    if (!slug) return;
    setBusy(true);
    try {
      const result = await apiPost<{ toolId: string }>(`/api/v1/admin/tools/${toolId}/duplicate`, { slug });
      router.push(`/admin/tools/${result.toolId}`);
    } catch (error) {
      window.alert(error instanceof ApiError ? error.message : "No fue posible duplicar la herramienta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" loading={busy} onClick={duplicate}>
      Duplicar
    </Button>
  );
}
