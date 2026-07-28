import { db } from "@/lib/db/client";
import { providers } from "@/db/schema";
import { Cpu } from "lucide-react";
import { ProvidersList } from "@/components/admin/providers/ProvidersList";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Proveedores — Admin" };

export default async function AdminProvidersPage() {
  const rows = await db.select().from(providers);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Cpu}
        title="Proveedores de IA"
        description="Supervisa disponibilidad, modelos y activación de los servicios configurados en el entorno."
      />
      <AdminPanel title={`${rows.length} proveedores configurados`} description="Las credenciales permanecen protegidas en variables de entorno." contentClassName="">
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
      </AdminPanel>
    </div>
  );
}
