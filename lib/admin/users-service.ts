import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groupMembers, groups, roles, sessions, userRoles, users } from "@/db/schema";
import { assertNotLastSuperAdmin, getRoleIdsByKeys } from "@/lib/permissions/rbac";
import type { RoleKey } from "@/lib/permissions/definitions";
import { recordAuditEvent } from "@/lib/audit/log";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";

async function getUserOr404(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]) throw new NotFoundError("Usuario no encontrado.");
  return rows[0];
}

export async function suspendUser(userId: string, actorId: string): Promise<void> {
  await assertNotLastSuperAdmin(userId);
  await getUserOr404(userId);
  await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, userId));
  await db.update(sessions).set({ status: "REVOKED", revokedAt: new Date() }).where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
  await recordAuditEvent({ actorId, action: "user.suspend", resourceType: "user", resourceId: userId });
}

export async function reactivateUser(userId: string, actorId: string): Promise<void> {
  await getUserOr404(userId);
  await db.update(users).set({ status: "ACTIVE", failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
  await recordAuditEvent({ actorId, action: "user.reactivate", resourceType: "user", resourceId: userId });
}

export async function blockUser(userId: string, actorId: string): Promise<void> {
  await assertNotLastSuperAdmin(userId);
  await getUserOr404(userId);
  await db.update(users).set({ status: "BLOCKED" }).where(eq(users.id, userId));
  await db.update(sessions).set({ status: "REVOKED", revokedAt: new Date() }).where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
  await recordAuditEvent({ actorId, action: "user.block", resourceType: "user", resourceId: userId });
}

export async function deleteUser(userId: string, actorId: string): Promise<void> {
  await assertNotLastSuperAdmin(userId);
  await getUserOr404(userId);
  await db.update(users).set({ status: "DELETED", deletedAt: new Date() }).where(eq(users.id, userId));
  await recordAuditEvent({ actorId, action: "user.delete", resourceType: "user", resourceId: userId });
}

export async function revokeUserSessions(userId: string, actorId: string): Promise<void> {
  await db.update(sessions).set({ status: "REVOKED", revokedAt: new Date() }).where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
  await recordAuditEvent({ actorId, action: "user.sessions.revoke", resourceType: "user", resourceId: userId });
}

export async function assignRole(userId: string, roleKey: RoleKey, actorId: string): Promise<void> {
  const roleMap = await getRoleIdsByKeys([roleKey]);
  const roleId = roleMap.get(roleKey);
  if (!roleId) throw new ValidationError(`Rol desconocido: ${roleKey}`);
  const existing = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId))).limit(1);
  if (existing.length > 0) return;
  await db.insert(userRoles).values({ userId, roleId, assignedBy: actorId });
  await recordAuditEvent({ actorId, action: "user.role.assign", resourceType: "user", resourceId: userId, metadata: { roleKey } });
}

export async function removeRole(userId: string, roleKey: RoleKey, actorId: string): Promise<void> {
  if (roleKey === "SUPER_ADMIN") await assertNotLastSuperAdmin(userId);
  const roleMap = await getRoleIdsByKeys([roleKey]);
  const roleId = roleMap.get(roleKey);
  if (!roleId) throw new ValidationError(`Rol desconocido: ${roleKey}`);
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  await recordAuditEvent({ actorId, action: "user.role.remove", resourceType: "user", resourceId: userId, metadata: { roleKey } });
}

export async function assignGroup(userId: string, groupId: string, actorId: string): Promise<void> {
  const group = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group[0]) throw new NotFoundError("Grupo no encontrado.");
  const existing = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1);
  if (existing.length > 0) return;
  await db.insert(groupMembers).values({ groupId, userId });
  await recordAuditEvent({ actorId, action: "user.group.assign", resourceType: "user", resourceId: userId, metadata: { groupId } });
}

export async function removeGroup(userId: string, groupId: string, actorId: string): Promise<void> {
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  await recordAuditEvent({ actorId, action: "user.group.remove", resourceType: "user", resourceId: userId, metadata: { groupId } });
}

export async function getUserDetail(userId: string) {
  const user = await getUserOr404(userId);
  const userRoleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const userGroupRows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId));
  return { user, roles: userRoleRows.map((r) => r.key), groups: userGroupRows };
}
