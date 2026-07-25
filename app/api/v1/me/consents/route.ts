import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { consents, legalDocuments } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";
import { ValidationError } from "@/lib/utils/errors";

const patchSchema = z.object({ kind: z.enum(["memory", "analytics", "marketing"]), granted: z.boolean() });

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rows = await db.select().from(consents).where(eq(consents.userId, user.id)).orderBy(desc(consents.createdAt));
    return NextResponse.json({ consents: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { kind, granted } = await parseJsonBody(request, patchSchema);

    const legalDoc = await db.select({ id: legalDocuments.id, version: legalDocuments.version }).from(legalDocuments).where(eq(legalDocuments.kind, "privacy_policy")).limit(1);
    if (!legalDoc[0]) throw new ValidationError("No hay un aviso de privacidad publicado.");

    await db.insert(consents).values({
      userId: user.id,
      legalDocumentId: legalDoc[0].id,
      kind,
      granted,
      version: legalDoc[0].version,
      revokedAt: granted ? null : new Date(),
    });

    await recordAuditEvent({ actorId: user.id, action: "consent.update", resourceType: "user", resourceId: user.id, metadata: { kind, granted } });
    return NextResponse.json({ message: "Consentimiento actualizado." });
  } catch (error) {
    return handleApiError(error);
  }
}
