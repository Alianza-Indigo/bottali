import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import { publishVersion } from "@/lib/tools/service";
import { getVersionForTool } from "@/lib/tools/repository";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.publish");
    const { id, versionId } = await params;
    await getToolForOrganization(id, user.organizationId);
    await getVersionForTool(id, versionId);
    await publishVersion(versionId, user.id);
    return NextResponse.json({ message: "Versión publicada." });
  } catch (error) {
    return handleApiError(error);
  }
}
