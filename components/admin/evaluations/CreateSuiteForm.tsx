"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Card, CardBody } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function CreateSuiteForm({ tools }: { tools: Array<{ id: string; slug: string }> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [toolId, setToolId] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/evaluations", { name, toolId, isMandatoryForPublish: mandatory, criteria: [] });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible crear la suite.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          {error && (
            <div className="w-full">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div>
            <Label htmlFor="suite-tool">Herramienta</Label>
            <select
              id="suite-tool"
              value={toolId}
              onChange={(e) => setToolId(e.target.value)}
              required
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="">Selecciona...</option>
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.slug}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="suite-name">Nombre de la suite</Label>
            <Input id="suite-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="h-4 w-4 rounded border-border-strong" />
            Obligatoria para publicar
          </label>
          <Button type="submit" loading={saving}>
            Crear suite
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
