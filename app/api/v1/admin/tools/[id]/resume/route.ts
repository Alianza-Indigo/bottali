import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { resumeTool } from "@/lib/tools/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.pause");
    const { id } = await params;
    await resumeTool(id, user.id);
    return NextResponse.json({ message: "Herramienta reanudada." });
  } catch (error) {
    return handleApiError(error);
  }
}
