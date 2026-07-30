import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groupMembers, groups, users } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";
import { NotFoundError } from "@/lib/utils/errors";

const patchSchema = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("groups.read");
    const { id } = await params;
    const rows = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.organizationId, admin.organizationId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Grupo no encontrado.");
    const members = await db
      .select({ id: users.id, email: users.email })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, id));
    return NextResponse.json({ group: rows[0], members });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("groups.manage");
    const { id } = await params;
    const body = await parseJsonBody(request, patchSchema);
    const [group] = await db
      .update(groups)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(groups.id, id), eq(groups.organizationId, admin.organizationId)))
      .returning({ id: groups.id });
    if (!group) throw new NotFoundError("Grupo no encontrado.");
    await recordAuditEvent({ actorId: admin.id, action: "group.update", resourceType: "group", resourceId: id });
    return NextResponse.json({ message: "Grupo actualizado." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("groups.manage");
    const { id } = await params;
    const [group] = await db
      .update(groups)
      .set({ deletedAt: new Date() })
      .where(and(eq(groups.id, id), eq(groups.organizationId, admin.organizationId)))
      .returning({ id: groups.id });
    if (!group) throw new NotFoundError("Grupo no encontrado.");
    await recordAuditEvent({ actorId: admin.id, action: "group.delete", resourceType: "group", resourceId: id });
    return NextResponse.json({ message: "Grupo eliminado." });
  } catch (error) {
    return handleApiError(error);
  }
}
