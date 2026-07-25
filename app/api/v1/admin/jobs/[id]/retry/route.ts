import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { runJob } from "@/lib/jobs/service";
import "@/lib/jobs/handlers";
import { handleApiError } from "@/lib/validation/http";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("settings.manage");
    const { id } = await params;
    const rows = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)).limit(1);
    if (!rows[0]) throw new NotFoundError("Trabajo no encontrado.");
    if (!["FAILED", "DEAD_LETTER", "CANCELLED"].includes(rows[0].status)) {
      throw new ConflictError("Solo se puede reintentar un trabajo fallido, cancelado o en dead-letter.");
    }
    await db.update(backgroundJobs).set({ status: "QUEUED", errorCode: null, errorMessage: null }).where(eq(backgroundJobs.id, id));
    const status = await runJob(id);
    return NextResponse.json({ job: status });
  } catch (error) {
    return handleApiError(error);
  }
}
