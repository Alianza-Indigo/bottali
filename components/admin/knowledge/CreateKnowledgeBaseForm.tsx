"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function CreateKnowledgeBaseForm({ toolId, defaultName }: { toolId: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/knowledge-bases", { toolId, name, description: description || undefined });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible crear la base de conocimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
      <div>
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="kb-name" className="mb-1 block text-sm font-medium text-ink">Nombre</label>
            <Input id="kb-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="kb-description" className="mb-1 block text-sm font-medium text-ink">Descripción</label>
            <Input id="kb-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fuentes y alcance de esta base" />
          </div>
          <Button type="submit" loading={saving} className="justify-self-start md:col-span-2">
            Crear
          </Button>
        </form>
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </div>
  );
}
