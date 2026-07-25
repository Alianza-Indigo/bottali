"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { FullVersionConfig } from "@/lib/tools/repository";

type AccessRules = NonNullable<FullVersionConfig["accessRules"]>;

const MODES = ["ALL_USERS", "SELECTED_USERS", "GROUPS", "ROLES", "INVITATION", "REQUEST_APPROVAL"] as const;

export function AccessSection({ toolId, versionId, initial }: { toolId: string; versionId: string; initial: AccessRules | null }) {
  const [form, setForm] = useState({
    mode: (initial?.mode ?? "ALL_USERS") as (typeof MODES)[number],
    waitlistEnabled: initial?.waitlistEnabled ?? false,
    gracePeriodDays: initial?.gracePeriodDays ?? 0,
    quota: initial?.quota ?? undefined,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/tools/${toolId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          accessRules: { ...form, allowedHours: null, allowedCountries: [] },
        }),
      });
      setMessage({ tone: "success", text: "Reglas de acceso guardadas." });
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
        <Label htmlFor="a-mode">Modo de acceso</Label>
        <select
          id="a-mode"
          value={form.mode}
          onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as typeof form.mode }))}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        >
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.waitlistEnabled}
          onChange={(e) => setForm((f) => ({ ...f, waitlistEnabled: e.target.checked }))}
          className="h-4 w-4 rounded border-border-strong"
        />
        Habilitar lista de espera
      </label>
      <Button onClick={save} loading={saving} className="self-start">
        Guardar acceso
      </Button>
    </div>
  );
}
