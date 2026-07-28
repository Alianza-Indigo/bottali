"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ROLE_KEYS } from "@/lib/permissions/definitions";

interface ImportResult {
  imported: number;
  failed: number;
  results: Array<{ email: string; success: boolean; error?: string }>;
}

/** §27 POST /api/v1/admin/users and POST /api/v1/admin/users/import. New users never receive
 * a password from the admin — they get a "set your password" email (same reset-password flow
 * as "forgot password"). */
export function CreateUserForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleKey, setRoleKey] = useState("USER");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const createSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/v1/admin/users", { email, displayName, roleKey });
      setEmail("");
      setDisplayName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible crear el usuario.");
    } finally {
      setSaving(false);
    }
  };

  const createBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setImportResult(null);
    try {
      const rows = bulkText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [rowEmail, rowName, rowRole] = line.split(",").map((v) => v.trim());
          return { email: rowEmail, displayName: rowName || rowEmail, roleKey: rowRole || undefined };
        });
      const result = await apiPost<ImportResult>("/api/v1/admin/users/import", { users: rows });
      setImportResult(result);
      setBulkText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible importar los usuarios.");
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="flex flex-col gap-4">
        <div className="inline-flex w-fit rounded-[8px] bg-surface-subtle p-1">
          <Button size="sm" variant={mode === "single" ? "primary" : "ghost"} onClick={() => setMode("single")}>
            Crear usuario
          </Button>
          <Button size="sm" variant={mode === "bulk" ? "primary" : "ghost"} onClick={() => setMode("bulk")}>
            Importar en lote
          </Button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {importResult && (
          <Alert tone={importResult.failed > 0 ? "warning" : "success"}>
            {importResult.imported} creados, {importResult.failed} fallidos.
            {importResult.failed > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {importResult.results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <li key={r.email}>
                      {r.email}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </Alert>
        )}

        {mode === "single" ? (
          <form onSubmit={createSingle} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_180px_auto] xl:items-end">
            <div className="min-w-0">
              <Label htmlFor="new-user-email">Correo</Label>
              <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="min-w-0">
              <Label htmlFor="new-user-name">Nombre</Label>
              <Input id="new-user-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="min-w-0">
              <Label htmlFor="new-user-role">Rol</Label>
              <select
                id="new-user-role"
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                {ROLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" loading={saving} className="w-full xl:w-auto">
              Crear
            </Button>
          </form>
        ) : (
          <form onSubmit={createBulk} className="flex flex-col gap-2">
            <Label htmlFor="bulk-users">Una fila por usuario: correo, nombre, rol (opcional)</Label>
            <Textarea
              id="bulk-users"
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"ana@empresa.com, Ana Pérez, USER\ncarlos@empresa.com, Carlos Ruiz"}
              required
            />
            <Button type="submit" loading={saving} className="self-start">
              Importar
            </Button>
          </form>
        )}
      </div>
  );
}
