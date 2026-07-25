import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { processPendingJobs } from "@/lib/jobs/service";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const result = await processPendingJobs(10);
    await recordAuditEvent({ action: "cron.jobs.run", resourceType: "cron", metadata: result });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
