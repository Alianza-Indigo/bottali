import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providers } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getEmbeddingProvider, getLLMProvider, getModerationProvider } from "@/lib/ai/registry";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("providers.manage");
    const { id } = await params;
    const rows = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    const provider = rows[0];
    if (!provider) throw new NotFoundError("Proveedor no encontrado.");

    const healthcheck =
      provider.kind === "llm"
        ? await getLLMProvider(provider.key).healthcheck()
        : provider.kind === "embedding"
          ? await getEmbeddingProvider().healthcheck()
          : provider.kind === "moderation"
            ? await getModerationProvider().healthcheck()
            : { healthy: false, message: "No hay una verificación disponible para este tipo de proveedor.", checkedAt: new Date().toISOString() };

    await db
      .update(providers)
      .set({ lastHealthcheckAt: new Date(), lastHealthcheckStatus: healthcheck.healthy ? "healthy" : "unhealthy" })
      .where(eq(providers.id, id));

    return NextResponse.json({ healthcheck });
  } catch (error) {
    return handleApiError(error);
  }
}
