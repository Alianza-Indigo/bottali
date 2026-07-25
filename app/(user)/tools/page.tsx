import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolBranding, toolCapabilities, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveCatalogState } from "@/lib/tools/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { CatalogCard } from "@/components/catalog/CatalogCard";

export const metadata = { title: "Catálogo" };

export default async function CatalogPage() {
  const user = await requireCurrentUser();
  const publishedTools = await db.select().from(tools).where(eq(tools.status, "PUBLISHED"));

  const items = (
    await Promise.all(
      publishedTools.map(async (tool) => {
        if (!tool.publishedVersionId) return null;
        const [branding] = await db.select().from(toolBranding).where(eq(toolBranding.toolVersionId, tool.publishedVersionId)).limit(1);
        const [capabilities] = await db.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId)).limit(1);
        if (!branding) return null;
        const state = await resolveCatalogState({ toolId: tool.id, userId: user.id });
        return {
          id: tool.id,
          slug: tool.slug,
          category: tool.category,
          name: branding.name,
          description: branding.description,
          iconUrl: branding.iconUrl,
          primaryColor: branding.primaryColor,
          hasVoice: Boolean(capabilities?.voiceInput || capabilities?.voiceOutput),
          hasFiles: Boolean(capabilities?.files),
          state,
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Catálogo de herramientas</h1>
        <p className="mt-1 text-sm text-ink-muted">Explora y activa las herramientas disponibles para tu cuenta.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No hay herramientas publicadas todavía" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CatalogCard key={item.id} tool={item} />
          ))}
        </div>
      )}
    </div>
  );
}
