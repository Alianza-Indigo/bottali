import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { publishVersion } from "@/lib/tools/service";
import { getVersionForTool } from "@/lib/tools/repository";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ValidationError } from "@/lib/utils/errors";

const schema = z.object({ scheduledFor: z.string().datetime() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.publish");
    const { id, versionId } = await params;
    await getVersionForTool(id, versionId);
    const { scheduledFor } = await parseJsonBody(request, schema);
    const date = new Date(scheduledFor);
    if (date.getTime() <= Date.now()) {
      throw new ValidationError("La fecha programada debe ser futura.");
    }
    await publishVersion(versionId, user.id, { scheduledFor: date });
    return NextResponse.json({ message: "Publicación programada." });
  } catch (error) {
    return handleApiError(error);
  }
}
