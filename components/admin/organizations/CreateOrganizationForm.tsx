"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      setName("");
      setSlug("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "No fue posible crear la organización.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {error && (
        <div className="sm:col-span-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="organization-name">Nombre</Label>
        <Input
          id="organization-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="organization-slug">Slug</Label>
        <Input
          id="organization-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          placeholder="cliente-ejemplo"
          required
        />
      </div>
      <Button type="submit" loading={busy}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Crear
      </Button>
    </form>
  );
}
