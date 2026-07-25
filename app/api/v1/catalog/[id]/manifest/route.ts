import { NextResponse } from "next/server";
import { getToolById, loadVersionConfig } from "@/lib/tools/repository";
import { canUserAccessTool } from "@/lib/tools/access";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

/**
 * Per-tool Web App Manifest (§18). Generated dynamically from the published version's
 * pwaConfig + branding — never a static file, so branding/PWA edits take effect the
 * moment a new version publishes. Icons/branding assets are public; nothing about tokens,
 * sessions, or conversation content is ever included here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const tool = await getToolById(id);
    if (!tool.publishedVersionId) throw new NotFoundError("La herramienta no tiene una versión publicada.");
    if (!(await canUserAccessTool(id, user.id))) throw new ForbiddenError("No tienes acceso a esta herramienta.");

    const config = await loadVersionConfig(tool.publishedVersionId);
    if (!config.pwaConfig || !config.capabilities?.pwa) {
      throw new NotFoundError("Esta herramienta no tiene PWA habilitada.");
    }

    const manifest = {
      name: config.pwaConfig.name,
      short_name: config.pwaConfig.shortName,
      description: config.pwaConfig.description,
      start_url: config.pwaConfig.startUrl,
      scope: config.pwaConfig.scope,
      display: config.pwaConfig.display,
      orientation: config.pwaConfig.orientation,
      theme_color: config.pwaConfig.themeColor,
      background_color: config.pwaConfig.backgroundColor,
      icons: config.branding?.iconUrl
        ? [
            { src: config.branding.iconUrl, sizes: "192x192", type: "image/png" },
            { src: config.branding.iconUrl, sizes: "512x512", type: "image/png" },
          ]
        : [],
      shortcuts: config.pwaConfig.shortcuts,
      screenshots: config.pwaConfig.screenshots.map((src) => ({ src })),
    };

    return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
  } catch (error) {
    return handleApiError(error);
  }
}
