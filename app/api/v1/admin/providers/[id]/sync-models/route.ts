import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerModels, providers } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getLLMProvider } from "@/lib/ai/registry";
import { syncProvidersFromEnv } from "@/lib/ai/sync-providers";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

/**
 * §27 POST /api/v1/admin/providers/{id}/sync-models. Only LLM providers have a live
 * "list models" call (embedding/moderation/stt/tts models are single, env-declared values —
 * see sync-providers.ts); for those kinds this just re-runs the same idempotent env sync.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("providers.manage");
    const { id } = await params;

    const rows = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    const provider = rows[0];
    if (!provider) throw new NotFoundError("Proveedor no encontrado.");

    await syncProvidersFromEnv(db);

    let syncedModels = 0;
    if (provider.kind === "llm") {
      const models = (await getLLMProvider(provider.key).listModels()).filter(
        (model) => provider.key !== "llm:gemini" || model.key === "gemini-3.1-flash-lite",
      );
      for (const model of models) {
        await db
          .insert(providerModels)
          .values({
            providerId: provider.id,
            modelKey: model.key,
            displayName: model.displayName,
            contextWindow: model.contextWindow,
          })
          .onConflictDoUpdate({
            target: [providerModels.providerId, providerModels.modelKey],
            set: { displayName: model.displayName, contextWindow: model.contextWindow },
          });
        syncedModels += 1;
      }
    }

    await db.update(providers).set({ lastHealthcheckAt: new Date() }).where(eq(providers.id, id));
    await recordAuditEvent({ actorId: admin.id, action: "provider.sync_models", resourceType: "provider", resourceId: id, metadata: { syncedModels } });

    return NextResponse.json({ syncedModels });
  } catch (error) {
    return handleApiError(error);
  }
}
