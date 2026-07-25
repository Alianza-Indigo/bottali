import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { featureFlags } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";

const patchSchema = z.object({ key: z.string().min(1).max(80), enabled: z.boolean() });

export async function GET() {
  try {
    await requireUserWithPermission("settings.manage");
    const rows = await db.select().from(featureFlags);
    return NextResponse.json({ featureFlags: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireUserWithPermission("settings.manage");
    const { key, enabled } = await parseJsonBody(request, patchSchema);
    const existing = await db.select({ key: featureFlags.key }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    if (existing[0]) {
      await db.update(featureFlags).set({ enabled, updatedAt: new Date() }).where(eq(featureFlags.key, key));
    } else {
      await db.insert(featureFlags).values({ key, enabled });
    }
    await recordAuditEvent({ actorId: admin.id, action: "settings.feature_flag.update", resourceType: "feature_flag", resourceId: key, metadata: { enabled } });
    return NextResponse.json({ message: "Feature flag actualizado." });
  } catch (error) {
    return handleApiError(error);
  }
}
