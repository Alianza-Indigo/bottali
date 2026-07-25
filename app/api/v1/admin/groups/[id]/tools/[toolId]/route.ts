import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { revokeToolAssignment } from "@/lib/tools/assignments";
import { handleApiError } from "@/lib/validation/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; toolId: string }> }) {
  try {
    const admin = await requireUserWithPermission("tools.assign");
    const { id, toolId } = await params;
    await revokeToolAssignment(toolId, "GROUP", id, admin.id);
    return NextResponse.json({ message: "Asignación revocada." });
  } catch (error) {
    return handleApiError(error);
  }
}
