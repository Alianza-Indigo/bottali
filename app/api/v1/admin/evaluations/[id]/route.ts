import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationCases } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { getEvaluationSuiteForOrganization } from "@/lib/evaluations/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("tools.read");
    const { id } = await params;
    const suite = await getEvaluationSuiteForOrganization(id, admin.organizationId);
    const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.suiteId, id));
    return NextResponse.json({ suite, cases });
  } catch (error) {
    return handleApiError(error);
  }
}
