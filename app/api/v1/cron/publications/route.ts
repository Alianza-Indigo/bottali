import { NextResponse } from "next/server";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { processScheduledPublications } from "@/lib/tools/service";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const result = await processScheduledPublications();
    await recordAuditEvent({ action: "cron.publications.run", resourceType: "cron", metadata: result });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
