"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
}

export function OrganizationSwitcher({
  activeOrganizationId,
  organizations,
  compact = false,
}: {
  activeOrganizationId: string;
  organizations: OrganizationOption[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function changeOrganization(organizationId: string) {
    if (organizationId === activeOrganizationId) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/organizations/switch", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (organizations.length <= 1) {
    const active = organizations.find((item) => item.id === activeOrganizationId);
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
        <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="truncate">{active?.name ?? "Organización"}</span>
      </span>
    );
  }

  return (
    <label className="inline-flex min-w-0 items-center gap-2">
      <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="sr-only">Organización activa</span>
      <select
        value={activeOrganizationId}
        disabled={busy}
        onChange={(event) => changeOrganization(event.target.value)}
        className={`min-w-0 rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-medium text-ink ${
          compact ? "max-w-40" : "max-w-56"
        }`}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  );
}
