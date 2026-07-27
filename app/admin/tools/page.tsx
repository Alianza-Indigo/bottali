import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DuplicateToolButton } from "@/components/admin/tools/DuplicateToolButton";
import { listAdminTools } from "@/lib/tools/repository";
import { getPublicationStatusTone, getVisibleToolStatus } from "@/lib/tools/presentation";

export const metadata = { title: "Herramientas — Admin" };

export default async function AdminToolsPage() {
  const withNames = await listAdminTools();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Herramientas</h1>
        <Link href="/admin/tools/new">
          <Button size="sm">Crear herramienta</Button>
        </Link>
      </div>
      {withNames.length === 0 ? (
        <EmptyState title="No hay herramientas todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {withNames.map((tool) => {
              const visibleStatus = getVisibleToolStatus(tool.status);
              return (
              <li key={tool.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link href={`/admin/tools/${tool.id}`} className="text-sm font-medium text-ink hover:underline">
                    {tool.name}
                  </Link>
                  <p className="text-xs text-ink-faint">{tool.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={getPublicationStatusTone(visibleStatus)}>{visibleStatus}</Badge>
                  <DuplicateToolButton toolId={tool.id} sourceSlug={tool.slug} />
                </div>
              </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
