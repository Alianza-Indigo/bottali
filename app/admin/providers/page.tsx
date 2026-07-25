import { db } from "@/lib/db/client";
import { providers } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { ProvidersList } from "@/components/admin/providers/ProvidersList";

export const metadata = { title: "Proveedores — Admin" };

export default async function AdminProvidersPage() {
  const rows = await db.select().from(providers);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Proveedores de IA</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Solo se muestran proveedores realmente configurados mediante variables de entorno.
        </p>
      </div>
      <Card>
        <ProvidersList
          providers={rows.map((p) => ({
            id: p.id,
            key: p.key,
            kind: p.kind,
            name: p.name,
            enabled: p.enabled,
            lastHealthcheckStatus: p.lastHealthcheckStatus,
          }))}
        />
      </Card>
    </div>
  );
}
