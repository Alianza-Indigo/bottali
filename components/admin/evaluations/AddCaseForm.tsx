"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function AddCaseForm({ suiteId }: { suiteId: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/v1/admin/evaluations/${suiteId}/cases`, { input, expectedBehavior });
      setInput("");
      setExpectedBehavior("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible agregar el caso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <Textarea placeholder="Entrada del caso de prueba" rows={2} value={input} onChange={(e) => setInput(e.target.value)} required />
      <Textarea
        placeholder="Comportamiento esperado"
        rows={2}
        value={expectedBehavior}
        onChange={(e) => setExpectedBehavior(e.target.value)}
        required
      />
      <Button type="submit" size="sm" loading={saving} className="self-start">
        Agregar caso
      </Button>
    </form>
  );
}
