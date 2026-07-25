"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { Card, CardBody } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function ProfileForm({
  email,
  displayName,
  locale,
  timezone,
}: {
  email: string;
  displayName: string;
  locale: string;
  timezone: string;
}) {
  const [form, setForm] = useState({ displayName, locale, timezone });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/v1/me", { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {saved && <Alert tone="success">Perfil actualizado.</Alert>}
          <div>
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div>
            <Label htmlFor="displayName">Nombre para mostrar</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="locale">Idioma</Label>
            <Input id="locale" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="timezone">Zona horaria</Label>
            <Input id="timezone" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
          </div>
          <Button type="submit" loading={saving} className="w-full">
            Guardar cambios
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
