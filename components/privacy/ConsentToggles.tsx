"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";

const CONSENT_LABELS: Record<string, string> = {
  memory: "Permitir memoria persistente entre conversaciones",
  analytics: "Permitir analítica de uso agregada",
  marketing: "Recibir comunicaciones sobre nuevas herramientas",
};

export function ConsentToggles() {
  const [state, setState] = useState<Record<string, boolean>>({ memory: false, analytics: false, marketing: false });
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (kind: string) => {
    const granted = !state[kind];
    setSaving(kind);
    try {
      await apiFetch("/api/v1/me/consents", { method: "PATCH", body: JSON.stringify({ kind, granted }) });
      setState((prev) => ({ ...prev, [kind]: granted }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(CONSENT_LABELS).map(([kind, label]) => (
        <label key={kind} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={state[kind] ?? false}
            disabled={saving === kind}
            onChange={() => toggle(kind)}
            className="h-4 w-4 rounded border-border-strong"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
