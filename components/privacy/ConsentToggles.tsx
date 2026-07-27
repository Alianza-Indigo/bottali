"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

const CONSENT_LABELS: Record<string, string> = {
  memory: "Permitir memoria persistente entre conversaciones",
  analytics: "Permitir analítica de uso agregada",
  marketing: "Recibir comunicaciones sobre nuevas herramientas",
};

interface ConsentRow {
  kind: string;
  granted: boolean;
  revokedAt: string | null;
  createdAt: string;
}

export function ConsentToggles() {
  const [state, setState] = useState<Record<string, boolean>>({ memory: false, analytics: false, marketing: false });
  const [saving, setSaving] = useState<string | null>(null);

  // Consents are append-only (GET returns the full history) — the current state of a kind
  // is whatever its most recent row says, since rows are ordered by createdAt desc.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ consents: ConsentRow[] }>("/api/v1/me/consents").then((res) => {
      if (cancelled) return;
      const latestByKind: Record<string, boolean> = {};
      for (const row of res.consents) {
        if (!(row.kind in latestByKind)) latestByKind[row.kind] = row.granted && !row.revokedAt;
      }
      setState((prev) => ({ ...prev, ...latestByKind }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
