import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { removeGroup } from "@/lib/admin/users-service";
import { handleApiError } from "@/lib/validation/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const admin = await requireUserWithPermission("groups.manage");
    const { id, userId } = await params;
    await removeGroup(userId, id, admin.id);
    return NextResponse.json({ message: "Usuario retirado del grupo." });
  } catch (error) {
    return handleApiError(error);
  }
}
