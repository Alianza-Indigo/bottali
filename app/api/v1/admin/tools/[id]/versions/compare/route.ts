import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import { compareVersions } from "@/lib/tools/service";
import { getVersionForTool } from "@/lib/tools/repository";
import { handleApiError } from "@/lib/validation/http";
import { ValidationError } from "@/lib/utils/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.read");
    const url = new URL(request.url);
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    if (!a || !b) throw new ValidationError("Debes especificar los parámetros 'a' y 'b' con los IDs de versión a comparar.");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    await Promise.all([getVersionForTool(id, a), getVersionForTool(id, b)]);
    const diff = await compareVersions(a, b);
    return NextResponse.json({ diff });
  } catch (error) {
    return handleApiError(error);
  }
}
