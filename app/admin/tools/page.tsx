import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
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

  // Single batched branding query instead of one per tool (§46 "evita consultas N+1").
  const versionIds = rows.map((t) => t.draftVersionId ?? t.publishedVersionId).filter((id): id is string => Boolean(id));
  const brandingRows =
    versionIds.length > 0
      ? await db.select({ toolVersionId: toolBranding.toolVersionId, name: toolBranding.name }).from(toolBranding).where(inArray(toolBranding.toolVersionId, versionIds))
      : [];
  const nameByVersion = new Map(brandingRows.map((b) => [b.toolVersionId, b.name]));

  const withNames = rows.map((tool) => {
    const versionId = tool.draftVersionId ?? tool.publishedVersionId;
    return { ...tool, name: (versionId && nameByVersion.get(versionId)) ?? tool.slug };
  });

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
