import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

/** §27 GET /api/v1/admin/audit/{id}: single audit event detail. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("audit.read");
    const { id } = await params;

    const rows = await db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Evento de auditoría no encontrado.");

    return NextResponse.json({ event: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
