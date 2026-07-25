"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { EmptyState } from "@/components/ui/EmptyState";

interface FlagRow {
  key: string;
  description: string | null;
  enabled: boolean;
}

export function FeatureFlagsList({ flags: initial }: { flags: FlagRow[] }) {
  const [flags, setFlags] = useState(initial);

  const toggle = async (key: string, enabled: boolean) => {
    await apiFetch("/api/v1/admin/settings/feature-flags", { method: "PATCH", body: JSON.stringify({ key, enabled }) });
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
  };

  if (flags.length === 0) {
    return (
      <div className="p-5">
        <EmptyState title="No hay feature flags configuradas" description="Se crean automáticamente la primera vez que se activan desde código." />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {flags.map((flag) => (
        <li key={flag.key} className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-sm text-ink">{flag.key}</p>
            {flag.description && <p className="text-xs text-ink-faint">{flag.description}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={flag.enabled}
              onChange={(e) => toggle(flag.key, e.target.checked)}
              className="h-4 w-4 rounded border-border-strong"
            />
            Habilitada
          </label>
        </li>
      ))}
    </ul>
  );
}
