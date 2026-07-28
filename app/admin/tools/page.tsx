import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { DuplicateToolButton } from "@/components/admin/tools/DuplicateToolButton";
import { listAdminTools } from "@/lib/tools/repository";
import { getPublicationStatusTone, getVisibleToolStatus } from "@/lib/tools/presentation";

export const metadata = { title: "Herramientas — Admin" };

export default async function AdminToolsPage() {
  const withNames = await listAdminTools();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Wrench}
        title="Herramientas"
        description="Configura, prueba y publica las experiencias de IA disponibles para tus usuarios."
        actions={
        <Link href="/admin/tools/new">
          <Button size="sm">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Crear herramienta
          </Button>
        </Link>
        }
      />
      {withNames.length === 0 ? (
        <EmptyState title="No hay herramientas todavía" />
      ) : (
        <AdminPanel title={`${withNames.length} herramientas`} description="Estado visible y acceso rápido a cada configuración." contentClassName="">
          <ul className="divide-y divide-border">
            {withNames.map((tool) => {
              const visibleStatus = getVisibleToolStatus(tool.status);
              return (
              <li key={tool.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <Link href={`/admin/tools/${tool.id}`} className="text-sm font-medium text-ink hover:underline">
                    {tool.name}
                  </Link>
                  <p className="text-xs text-ink-faint">{tool.slug}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge tone={getPublicationStatusTone(visibleStatus)}>{visibleStatus}</Badge>
                  <DuplicateToolButton toolId={tool.id} sourceSlug={tool.slug} />
                </div>
              </li>
              );
            })}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
