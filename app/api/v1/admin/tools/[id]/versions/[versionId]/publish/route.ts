import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { publishVersion } from "@/lib/tools/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.publish");
    const { versionId } = await params;
    await publishVersion(versionId, user.id);
    return NextResponse.json({ message: "Versión publicada." });
  } catch (error) {
    return handleApiError(error);
  }
}
