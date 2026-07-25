import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { suspendUser } from "@/lib/admin/users-service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("users.suspend");
    const { id } = await params;
    await suspendUser(id, admin.id);
    return NextResponse.json({ message: "Usuario suspendido." });
  } catch (error) {
    return handleApiError(error);
  }
}
