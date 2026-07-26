import { NextResponse } from "next/server";
import "@/lib/jobs/handlers";
import { assertValidCronRequest } from "@/lib/security/cron-auth";
import { getJobHandler } from "@/lib/jobs/registry";
import { recordAuditEvent } from "@/lib/audit/log";
import { handleApiError } from "@/lib/validation/http";

const HANDLER_NAMES = ["cleanup_expired_files", "expire_pending_tool_confirmations"] as const;

export async function POST(request: Request) {
  try {
    assertValidCronRequest(request);
    const jobContext = { jobId: "cron-cleanup", attempt: 1, maxAttempts: 1, reportProgress: async () => {}, isCancelled: async () => false };

    const results: Record<string, unknown> = {};
    for (const name of HANDLER_NAMES) {
      const handler = getJobHandler(name);
      if (!handler) throw new Error(`El manejador "${name}" no está registrado.`);
      results[name] = (await handler({}, jobContext)) ?? {};
    }

    await recordAuditEvent({ action: "cron.cleanup.run", resourceType: "cron", metadata: results });
    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error);
  }
}
