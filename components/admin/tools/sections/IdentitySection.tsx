"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type Branding = NonNullable<FullVersionConfig["branding"]>;

export function IdentitySection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: Branding | null }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    shortName: initial?.shortName ?? "",
    description: initial?.description ?? "",
    fullDescription: initial?.fullDescription ?? "",
    targetAudience: initial?.targetAudience ?? "",
    iconUrl: initial?.iconUrl ?? "",
    primaryColor: initial?.primaryColor ?? "#1d4ed8",
    secondaryColor: initial?.secondaryColor ?? "#0f172a",
    theme: (initial?.theme ?? "system") as "light" | "dark" | "system",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ branding: { ...form, tags: [] } }),
      });
      setMessage({ tone: "success", text: "Identidad guardada." });
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
        <Label htmlFor="i-name">Nombre</Label>
        <Input id="i-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="i-shortName">Nombre corto</Label>
        <Input id="i-shortName" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="i-description">Descripción breve</Label>
        <Textarea id="i-description" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="i-fullDescription">Descripción completa</Label>
        <Textarea
          id="i-fullDescription"
          rows={4}
          value={form.fullDescription}
          onChange={(e) => setForm((f) => ({ ...f, fullDescription: e.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="i-targetAudience">Público objetivo</Label>
        <Input id="i-targetAudience" value={form.targetAudience} onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="i-iconUrl">URL del icono</Label>
        <Input id="i-iconUrl" value={form.iconUrl} onChange={(e) => setForm((f) => ({ ...f, iconUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="i-primaryColor">Color primario</Label>
          <Input id="i-primaryColor" type="color" value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="i-secondaryColor">Color secundario</Label>
          <Input
            id="i-secondaryColor"
            type="color"
            value={form.secondaryColor}
            onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="i-theme">Tema</Label>
        <select
          id="i-theme"
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value as typeof form.theme }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="system">Automático</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar identidad
      </Button>
    </div>
  );
}
