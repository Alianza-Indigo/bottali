import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { providers } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { recordAuditEvent } from "@/lib/audit/log";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

const patchSchema = z.object({ enabled: z.boolean() });

/**
 * §27 PATCH /api/v1/admin/providers/{id}. This is a manual kill switch, not a way to turn on
 * a provider that isn't actually configured: `enabled` here only ever moves further toward
 * "off" in spirit — the next syncProvidersFromEnv() run (cron/health/admin action) resets it
 * back to whatever the environment variables actually say, which is the only source of truth
 * for whether a provider is really usable (§22: never show functionality that isn't configured).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("providers.manage");
    const { id } = await params;
    const { enabled } = await parseJsonBody(request, patchSchema);

    const rows = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Proveedor no encontrado.");

    await db.update(providers).set({ enabled, updatedAt: new Date() }).where(eq(providers.id, id));
    await recordAuditEvent({ actorId: admin.id, action: "provider.update", resourceType: "provider", resourceId: id, metadata: { enabled } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
