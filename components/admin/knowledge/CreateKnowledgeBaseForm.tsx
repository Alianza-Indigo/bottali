"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function CreateKnowledgeBaseForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/knowledge-bases", { name });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible crear la base de conocimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="kb-name" className="sr-only">
              Nombre de la base de conocimiento
            </label>
            <Input id="kb-name" placeholder="Nombre de la base de conocimiento" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Button type="submit" loading={saving}>
            Crear
          </Button>
        </form>
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
