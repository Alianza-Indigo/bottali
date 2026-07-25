import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { getJobHandler } from "@/lib/jobs/registry";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const handler = getJobHandler("provider_health_check");
    if (!handler) throw new Error("El manejador de salud de proveedores no está registrado.");
    const result = (await handler({}, { jobId: "cron-provider-health", attempt: 1, maxAttempts: 1, reportProgress: async () => {}, isCancelled: async () => false })) ?? {};
    await recordAuditEvent({ action: "cron.provider_health.run", resourceType: "cron", metadata: result });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
