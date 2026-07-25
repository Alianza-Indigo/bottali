"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/groups", { name });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible crear el grupo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="group-name" className="sr-only">
              Nombre del grupo
            </label>
            <Input id="group-name" placeholder="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Button type="submit" loading={saving}>
            Crear grupo
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
