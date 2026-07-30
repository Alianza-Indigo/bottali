import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import { duplicateTool } from "@/lib/tools/service";
import { slugSchema } from "@/lib/validation/tools";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ slug: slugSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.create");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    const { slug } = await parseJsonBody(request, schema);
    const result = await duplicateTool(id, slug, user.id, user.organizationId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
