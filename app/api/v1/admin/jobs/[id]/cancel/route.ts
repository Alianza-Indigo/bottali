import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { requestJobCancellation } from "@/lib/jobs/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("settings.manage");
    const { id } = await params;
    await requestJobCancellation(id);
    return NextResponse.json({ message: "Cancelación solicitada." });
  } catch (error) {
    return handleApiError(error);
  }
}
