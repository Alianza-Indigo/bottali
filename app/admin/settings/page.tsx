import { db } from "@/lib/db/client";
import { featureFlags } from "@/db/schema";
import { Settings2 } from "lucide-react";
import { FeatureFlagsList } from "@/components/admin/settings/FeatureFlagsList";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Configuración — Admin" };

export default async function AdminSettingsPage() {
  const rows = await db.select().from(featureFlags);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Settings2}
        title="Configuración"
        description="Controla funciones globales de la plataforma sin necesidad de desplegar código."
      />
      <AdminPanel title="Funciones de plataforma" description="Los cambios se aplican globalmente." contentClassName="">
        <FeatureFlagsList flags={rows.map((f) => ({ key: f.key, description: f.description, enabled: f.enabled }))} />
      </AdminPanel>
    </div>
  );
}
