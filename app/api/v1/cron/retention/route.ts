import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { getJobHandler } from "@/lib/jobs/registry";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const handler = getJobHandler("retention_cleanup");
    if (!handler) throw new Error("El manejador de retención no está registrado.");
    const result = (await handler({}, { jobId: "cron-retention", attempt: 1, maxAttempts: 1, reportProgress: async () => {}, isCancelled: async () => false })) ?? {};
    await recordAuditEvent({ action: "cron.retention.run", resourceType: "cron", metadata: result });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
