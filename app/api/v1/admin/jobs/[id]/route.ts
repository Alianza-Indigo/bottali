import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getJobStatus } from "@/lib/jobs/service";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("settings.manage");
    const { id } = await params;
    const status = await getJobStatus(id);
    if (!status) throw new NotFoundError("Trabajo no encontrado.");
    return NextResponse.json({ job: status });
  } catch (error) {
    return handleApiError(error);
  }
}
