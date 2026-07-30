import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import { rollbackToVersion } from "@/lib/tools/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ targetVersionId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.publish");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    const { targetVersionId } = await parseJsonBody(request, schema);
    const result = await rollbackToVersion(id, targetVersionId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
