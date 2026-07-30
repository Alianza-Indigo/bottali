import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { removeOrganizationMember } from "@/lib/organizations/service";
import { ForbiddenError } from "@/lib/utils/errors";
import { handleApiError } from "@/lib/validation/http";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const user = await requireUserWithPermission("organizations.members.manage");
    const { id, userId } = await params;
    if (id !== user.organizationId) {
      throw new ForbiddenError("Cambia a esa organización antes de administrar sus miembros.");
    }
    await removeOrganizationMember(id, userId, user.id);
    return NextResponse.json({ message: "Miembro eliminado." });
  } catch (error) {
    return handleApiError(error);
  }
}
