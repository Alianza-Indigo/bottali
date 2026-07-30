import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolBranding, toolCapabilities, tools } from "@/db/schema";
import { resolveCatalogStates, type CatalogState } from "./access";

export interface CatalogItem {
  id: string;
  slug: string;
  category: string | null;
  name: string;
  shortName: string;
  description: string;
  iconUrl: string | null;
  primaryColor: string;
  targetAudience: string | null;
  capabilities: typeof toolCapabilities.$inferSelect | null;
  state: CatalogState;
}

/**
 * Shared by the catalog page and GET /api/v1/catalog (previously duplicated, each with its
 * own N+1: one branding + one capabilities query per tool, inside a per-tool map). Batches
 * branding/capabilities across all published tools in two queries total, and calls
 * resolveCatalogStates once instead of resolveCatalogState per tool (§46).
 */
export async function getCatalogItems(userId: string, organizationId: string): Promise<CatalogItem[]> {
  const publishedTools = await db
    .select()
    .from(tools)
    .where(and(eq(tools.organizationId, organizationId), eq(tools.status, "PUBLISHED")));
  const versionIds = publishedTools.map((t) => t.publishedVersionId).filter((id): id is string => Boolean(id));
  if (versionIds.length === 0) return [];

  const [brandingRows, capabilitiesRows, states] = await Promise.all([
    db.select().from(toolBranding).where(inArray(toolBranding.toolVersionId, versionIds)),
    db.select().from(toolCapabilities).where(inArray(toolCapabilities.toolVersionId, versionIds)),
    resolveCatalogStates(
      publishedTools.map((t) => t.id),
      userId,
      organizationId,
    ),
  ]);

  const brandingByVersion = new Map(brandingRows.map((b) => [b.toolVersionId, b]));
  const capabilitiesByVersion = new Map(capabilitiesRows.map((c) => [c.toolVersionId, c]));

  const items: CatalogItem[] = [];
  for (const tool of publishedTools) {
    if (!tool.publishedVersionId) continue;
    const branding = brandingByVersion.get(tool.publishedVersionId);
    if (!branding) continue;
    items.push({
      id: tool.id,
      slug: tool.slug,
      category: tool.category,
      name: branding.name,
      shortName: branding.shortName,
      description: branding.description,
      iconUrl: branding.iconUrl,
      primaryColor: branding.primaryColor,
      targetAudience: branding.targetAudience,
      capabilities: capabilitiesByVersion.get(tool.publishedVersionId) ?? null,
      state: states.get(tool.id) ?? "COMING_SOON",
    });
  }
  return items;
}
