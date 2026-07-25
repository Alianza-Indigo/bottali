import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationCases, evaluationSuites } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.read");
    const { id } = await params;
    const rows = await db.select().from(evaluationSuites).where(eq(evaluationSuites.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Suite no encontrada.");
    const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.suiteId, id));
    return NextResponse.json({ suite: rows[0], cases });
  } catch (error) {
    return handleApiError(error);
  }
}
