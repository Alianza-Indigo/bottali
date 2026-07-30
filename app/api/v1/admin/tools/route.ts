import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { createTool } from "@/lib/tools/service";
import { createToolSchema } from "@/lib/validation/tools";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    const user = await requireUserWithPermission("tools.read");
    const rows = await db
      .select()
      .from(tools)
      .where(eq(tools.organizationId, user.organizationId))
      .orderBy(desc(tools.createdAt))
      .limit(100);
    return NextResponse.json({ tools: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserWithPermission("tools.create");
    const body = await parseJsonBody(request, createToolSchema);
    const result = await createTool(body, user.id, user.organizationId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
