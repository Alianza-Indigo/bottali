import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerModels, providers } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    await requireUserWithPermission("providers.read");
    const rows = await db
      .select({
        id: providerModels.id,
        modelKey: providerModels.modelKey,
        displayName: providerModels.displayName,
        contextWindow: providerModels.contextWindow,
        providerId: providerModels.providerId,
        providerKind: providers.kind,
        providerEnabled: providers.enabled,
      })
      .from(providerModels)
      .innerJoin(providers, eq(providers.id, providerModels.providerId));
    return NextResponse.json({ models: rows.filter((m) => m.providerEnabled) });
  } catch (error) {
    return handleApiError(error);
  }
}
