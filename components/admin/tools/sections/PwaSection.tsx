"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type PwaConfig = NonNullable<FullVersionConfig["pwaConfig"]>;

export function PwaSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: PwaConfig | null }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    shortName: initial?.shortName ?? "",
    description: initial?.description ?? "",
    themeColor: initial?.themeColor ?? "#1d4ed8",
    backgroundColor: initial?.backgroundColor ?? "#ffffff",
    startUrl: initial?.startUrl ?? "",
    scope: initial?.scope ?? "/tools/",
    display: (initial?.display ?? "standalone") as "standalone" | "fullscreen" | "minimal-ui" | "browser",
    orientation: (initial?.orientation ?? "any") as "any" | "portrait" | "landscape",
    offlinePageUrl: initial?.offlinePageUrl ?? "/offline.html",
    updatePolicy: (initial?.updatePolicy ?? "prompt") as "prompt" | "auto",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ pwaConfig: { ...form, shortcuts: [], screenshots: [], deepLinks: [] } }),
      });
      setMessage({ tone: "success", text: "Configuración de PWA guardada." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof ApiError ? error.message : "No fue posible guardar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor="p-name">Nombre de la PWA</Label>
        <Input id="p-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="p-shortName">Nombre corto</Label>
        <Input id="p-shortName" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="p-description">Descripción</Label>
        <Input id="p-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="p-startUrl">start_url</Label>
        <Input id="p-startUrl" value={form.startUrl} onChange={(e) => setForm((f) => ({ ...f, startUrl: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="p-scope">scope</Label>
        <Input id="p-scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="p-themeColor">Color de tema</Label>
          <Input id="p-themeColor" type="color" value={form.themeColor} onChange={(e) => setForm((f) => ({ ...f, themeColor: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="p-backgroundColor">Color de fondo</Label>
          <Input
            id="p-backgroundColor"
            type="color"
            value={form.backgroundColor}
            onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
          />
        </div>
      </div>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar PWA
      </Button>
    </div>
  );
}
