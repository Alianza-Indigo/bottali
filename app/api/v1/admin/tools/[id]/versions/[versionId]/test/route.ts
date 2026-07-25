import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { markVersionTesting } from "@/lib/tools/service";
import { runToolTest } from "@/lib/tools/test-run";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ message: z.string().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.update");
    const { versionId } = await params;
    const { message } = await parseJsonBody(request, schema);

    const result = await runToolTest(versionId, message);
    await markVersionTesting(versionId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
