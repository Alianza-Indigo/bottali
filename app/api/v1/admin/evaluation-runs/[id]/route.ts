import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationResults, evaluationRuns } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.read");
    const { id } = await params;
    const rows = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Ejecución no encontrada.");
    const results = await db.select().from(evaluationResults).where(eq(evaluationResults.runId, id));
    return NextResponse.json({ run: rows[0], results });
  } catch (error) {
    return handleApiError(error);
  }
}
