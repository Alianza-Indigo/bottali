import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerModels, providers, toolProviderCredentials } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET(request: Request) {
  try {
    await requireUserWithPermission("providers.read");
    const toolId = new URL(request.url).searchParams.get("toolId");
    const rows = await db
      .select({
        id: providerModels.id,
        modelKey: providerModels.modelKey,
        displayName: providerModels.displayName,
        contextWindow: providerModels.contextWindow,
        providerId: providerModels.providerId,
        providerKind: providers.kind,
        providerEnabled: providers.enabled,
        available: providerModels.available,
      })
      .from(providerModels)
      .innerJoin(providers, eq(providers.id, providerModels.providerId));
    const credentialProviderIds = new Set(
      toolId
        ? (
            await db
              .select({ providerId: toolProviderCredentials.providerId })
              .from(toolProviderCredentials)
              .where(eq(toolProviderCredentials.toolId, toolId))
          ).map((credential) => credential.providerId)
        : [],
    );
    return NextResponse.json({
      models: rows.filter(
        (model) =>
          model.available &&
          (model.providerEnabled || credentialProviderIds.has(model.providerId)),
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
