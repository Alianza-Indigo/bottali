import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolBranding, toolCapabilities, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveCatalogState } from "@/lib/tools/access";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const publishedTools = await db.select().from(tools).where(eq(tools.status, "PUBLISHED"));

    const items = await Promise.all(
      publishedTools.map(async (tool) => {
        if (!tool.publishedVersionId) return null;
        const [branding, capabilities, state] = await Promise.all([
          db.select().from(toolBranding).where(eq(toolBranding.toolVersionId, tool.publishedVersionId)).limit(1),
          db.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId)).limit(1),
          resolveCatalogState({ toolId: tool.id, userId: user.id }),
        ]);
        if (!branding[0]) return null;
        return {
          id: tool.id,
          slug: tool.slug,
          category: tool.category,
          name: branding[0].name,
          shortName: branding[0].shortName,
          description: branding[0].description,
          iconUrl: branding[0].iconUrl,
          primaryColor: branding[0].primaryColor,
          targetAudience: branding[0].targetAudience,
          capabilities: capabilities[0] ?? null,
          state,
        };
      }),
    );

    return NextResponse.json({ tools: items.filter(Boolean) });
  } catch (error) {
    return handleApiError(error);
  }
}
