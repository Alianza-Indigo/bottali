import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { markVersionUnderReview } from "@/lib/tools/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.review");
    const { versionId } = await params;
    await markVersionUnderReview(versionId, user.id);
    return NextResponse.json({ message: "Versión enviada a revisión." });
  } catch (error) {
    return handleApiError(error);
  }
}
