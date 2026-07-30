import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { toolBranding, toolCapabilities, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveCatalogState } from "@/lib/tools/access";
import { Card, CardBody } from "@/components/ui/Card";
import { CatalogCard } from "@/components/catalog/CatalogCard";

export default async function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireCurrentUser();

  const toolRows = await db
    .select()
    .from(tools)
    .where(and(eq(tools.organizationId, user.organizationId), eq(tools.slug, slug)))
    .limit(1);
  const tool = toolRows[0];
  if (!tool || tool.status !== "PUBLISHED" || !tool.publishedVersionId) notFound();

  const [branding] = await db.select().from(toolBranding).where(eq(toolBranding.toolVersionId, tool.publishedVersionId)).limit(1);
  const [capabilities] = await db.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId)).limit(1);
  if (!branding) notFound();

  const state = await resolveCatalogState({ toolId: tool.id, userId: user.id, organizationId: user.organizationId });

  return (
    <div className="mx-auto max-w-2xl">
      <CatalogCard
        tool={{
          id: tool.id,
          slug: tool.slug,
          category: tool.category,
          name: branding.name,
          description: branding.fullDescription || branding.description,
          iconUrl: branding.iconUrl,
          primaryColor: branding.primaryColor,
          hasVoice: Boolean(capabilities?.voiceInput || capabilities?.voiceOutput),
          hasFiles: Boolean(capabilities?.files),
          state,
        }}
      />
      {branding.targetAudience && (
        <Card className="mt-4">
          <CardBody>
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Público objetivo</h2>
            <p className="mt-1 text-sm text-ink">{branding.targetAudience}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
