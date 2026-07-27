import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { approveVersion } from "@/lib/tools/service";
import { getVersionForTool } from "@/lib/tools/repository";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.approve");
    const { id, versionId } = await params;
    await getVersionForTool(id, versionId);
    await approveVersion(versionId, user.id);
    return NextResponse.json({ message: "Versión aprobada." });
  } catch (error) {
    return handleApiError(error);
  }
}
