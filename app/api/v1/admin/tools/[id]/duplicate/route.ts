import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { duplicateTool } from "@/lib/tools/service";
import { slugSchema } from "@/lib/validation/tools";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ slug: slugSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.create");
    const { id } = await params;
    const { slug } = await parseJsonBody(request, schema);
    const result = await duplicateTool(id, slug, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
