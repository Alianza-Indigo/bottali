import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { runSuite } from "@/lib/evaluations/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ toolVersionId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("tools.update");
    const { id } = await params;
    const { toolVersionId } = await parseJsonBody(request, schema);
    const result = await runSuite(id, toolVersionId, admin.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
