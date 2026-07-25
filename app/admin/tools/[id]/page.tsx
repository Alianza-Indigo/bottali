import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { providers, toolVersions, tools } from "@/db/schema";
import { ensureEditableDraftVersion } from "@/lib/tools/service";
import { loadVersionConfig } from "@/lib/tools/repository";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ToolBuilder } from "@/components/admin/tools/ToolBuilder";

export default async function AdminToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const toolRows = await db.select().from(tools).where(eq(tools.id, id)).limit(1);
  const tool = toolRows[0];
  if (!tool) notFound();

  const draftVersionId = await ensureEditableDraftVersion(id, user.id);
  const config = await loadVersionConfig(draftVersionId);
  const versions = await db.select().from(toolVersions).where(eq(toolVersions.toolId, id));
  const modelProviders = await db.select().from(providers).where(eq(providers.enabled, true));

  return (
    <ToolBuilder
      tool={{ id: tool.id, slug: tool.slug, status: tool.status, publishedVersionId: tool.publishedVersionId }}
      versionId={draftVersionId}
      config={config}
      versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status }))}
      providers={modelProviders.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
    />
  );
}
