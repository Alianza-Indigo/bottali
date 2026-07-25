import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationRuns } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

/**
 * Evaluation runs currently execute synchronously within runSuite() (§24), so there is no
 * realistic window to intercept a run mid-flight — this endpoint still exists for API
 * completeness and correctly cancels a run that is queued/not yet started.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.update");
    const { id } = await params;
    await db.update(evaluationRuns).set({ status: "CANCELLED" }).where(and(eq(evaluationRuns.id, id), eq(evaluationRuns.status, "CREATED")));
    return NextResponse.json({ message: "Solicitud de cancelación procesada." });
  } catch (error) {
    return handleApiError(error);
  }
}
