import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { deleteUser, getUserDetail } from "@/lib/admin/users-service";
import { handleApiError } from "@/lib/validation/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("users.read");
    const { id } = await params;
    const detail = await getUserDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("users.delete");
    const { id } = await params;
    await deleteUser(id, admin.id);
    return NextResponse.json({ message: "Usuario eliminado." });
  } catch (error) {
    return handleApiError(error);
  }
}
