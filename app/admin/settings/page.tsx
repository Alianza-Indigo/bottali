import { db } from "@/lib/db/client";
import { featureFlags } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { FeatureFlagsList } from "@/components/admin/settings/FeatureFlagsList";

export const metadata = { title: "Configuración — Admin" };

export default async function AdminSettingsPage() {
  const rows = await db.select().from(featureFlags);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Configuración de la plataforma</h1>
        <p className="mt-1 text-sm text-ink-muted">Feature flags para habilitar o deshabilitar funcionalidades globalmente.</p>
      </div>
      <Card>
        <FeatureFlagsList flags={rows.map((f) => ({ key: f.key, description: f.description, enabled: f.enabled }))} />
      </Card>
    </div>
  );
}
