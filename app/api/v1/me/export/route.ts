import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { db } from "@/lib/db/client";
import { dataRequests } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getJobProvider } from "@/lib/jobs";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST() {
  try {
    const user = await requireCurrentUser();

    const [request] = await db.insert(dataRequests).values({ userId: user.id, kind: "export" }).returning({ id: dataRequests.id });
    if (!request) throw new Error("No fue posible registrar la solicitud de exportación.");

    const job = await getJobProvider().enqueue(
      "account.export_data",
      { requestId: request.id, userId: user.id },
      { idempotencyKey: `export:${request.id}` },
    );

    await recordAuditEvent({ actorId: user.id, action: "account.export_request", resourceType: "user", resourceId: user.id, metadata: { jobId: job.id } });

    return NextResponse.json({ requestId: request.id, jobId: job.id });
  } catch (error) {
    return handleApiError(error);
  }
}
