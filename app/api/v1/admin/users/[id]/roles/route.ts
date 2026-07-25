import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { assignRole } from "@/lib/admin/users-service";
import { ROLE_KEYS } from "@/lib/permissions/definitions";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ roleKey: z.enum(ROLE_KEYS) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("roles.manage");
    const { id } = await params;
    const { roleKey } = await parseJsonBody(request, schema);
    await assignRole(id, roleKey, admin.id);
    return NextResponse.json({ message: "Rol asignado." });
  } catch (error) {
    return handleApiError(error);
  }
}
