import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { roles } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { removeRole } from "@/lib/admin/users-service";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";
import type { RoleKey } from "@/lib/permissions/definitions";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  try {
    const admin = await requireUserWithPermission("roles.manage");
    const { id, roleId } = await params;
    const roleRows = await db.select({ key: roles.key }).from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!roleRows[0]) throw new NotFoundError("Rol no encontrado.");
    await removeRole(id, roleRows[0].key as RoleKey, admin.id);
    return NextResponse.json({ message: "Rol retirado." });
  } catch (error) {
    return handleApiError(error);
  }
}
