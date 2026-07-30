import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { addCase, getEvaluationSuiteForOrganization } from "@/lib/evaluations/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({
  input: z.string().min(1).max(4000),
  expectedBehavior: z.string().min(1).max(2000),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("tools.update");
    const { id } = await params;
    await getEvaluationSuiteForOrganization(id, admin.organizationId);
    const body = await parseJsonBody(request, schema);
    const testCase = await addCase(id, body.input, body.expectedBehavior, body.riskLevel);
    return NextResponse.json({ case: testCase }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
