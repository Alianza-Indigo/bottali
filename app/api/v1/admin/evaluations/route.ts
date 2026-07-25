import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { evaluationSuites } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { createSuite } from "@/lib/evaluations/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const createSchema = z.object({
  toolId: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  criteria: z.array(z.string()).default([]),
  isMandatoryForPublish: z.boolean().default(false),
});

export async function GET() {
  try {
    await requireUserWithPermission("tools.read");
    const rows = await db.select().from(evaluationSuites);
    return NextResponse.json({ suites: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireUserWithPermission("tools.update");
    const body = await parseJsonBody(request, createSchema);
    const suite = await createSuite({ ...body, actorId: admin.id });
    return NextResponse.json({ suite }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
