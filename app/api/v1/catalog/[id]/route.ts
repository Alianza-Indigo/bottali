import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveCatalogState } from "@/lib/tools/access";
import { loadVersionConfig } from "@/lib/tools/repository";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts either a tool UUID or its slug in the same [id] segment — Next.js requires every
 * dynamic segment at this directory level (activate/deactivate/manifest/etc. all live
 * alongside this route) to share one parameter name, so slug lookup is a fallback here
 * rather than a separate [slug] route. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const rows = await db
      .select()
      .from(tools)
      .where(UUID_RE.test(id) ? eq(tools.id, id) : eq(tools.slug, id))
      .limit(1);
    const tool = rows[0];
    if (!tool || tool.status !== "PUBLISHED" || !tool.publishedVersionId) {
      throw new NotFoundError("Herramienta no encontrada.");
    }

    const [config, state] = await Promise.all([
      loadVersionConfig(tool.publishedVersionId),
      resolveCatalogState({ toolId: tool.id, userId: user.id }),
    ]);

    return NextResponse.json({
      tool: { id: tool.id, slug: tool.slug, category: tool.category },
      branding: config.branding,
      behavior: state === "ACTIVE" ? { welcomeMessage: config.behavior?.welcomeMessage, scopeNotice: config.behavior?.scopeNotice } : null,
      capabilities: config.capabilities,
      state,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
