import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolBranding, tools } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Herramientas — Admin" };

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  CONFIGURATION_INCOMPLETE: "warning",
  INTERNAL_TESTING: "neutral",
  UNDER_REVIEW: "warning",
  APPROVED: "brand",
  SCHEDULED: "brand",
  PUBLISHED: "success",
  PAUSED: "warning",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
};

export default async function AdminToolsPage() {
  const rows = await db.select().from(tools).orderBy(desc(tools.createdAt));

  const withNames = await Promise.all(
    rows.map(async (tool) => {
      const versionId = tool.draftVersionId ?? tool.publishedVersionId;
      const branding = versionId
        ? (await db.select({ name: toolBranding.name }).from(toolBranding).where(eq(toolBranding.toolVersionId, versionId)).limit(1))[0]
        : null;
      return { ...tool, name: branding?.name ?? tool.slug };
    }),
  );

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
            {withNames.map((tool) => (
              <li key={tool.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link href={`/admin/tools/${tool.id}`} className="text-sm font-medium text-ink hover:underline">
                    {tool.name}
                  </Link>
                  <p className="text-xs text-ink-faint">{tool.slug}</p>
                </div>
                <Badge tone={STATUS_TONE[tool.status] ?? "neutral"}>{tool.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
