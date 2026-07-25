import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import { ForbiddenError } from "@/lib/utils/errors";
import type { PermissionKey, RoleKey } from "./definitions";

export async function getUserRoleKeys(userId: string): Promise<RoleKey[]> {
  const rows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.key as RoleKey);
}

export async function getUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  return new Set(rows.map((r) => r.key as PermissionKey));
}

export async function hasPermission(userId: string, permission: PermissionKey): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(permission);
}

/** Throws ForbiddenError server-side. Never trust a permission flag sent by the client. */
export async function requirePermission(userId: string, permission: PermissionKey): Promise<void> {
  const allowed = await hasPermission(userId, permission);
  if (!allowed) {
    throw new ForbiddenError(`Falta el permiso requerido: ${permission}`);
  }
}

export async function countSuperAdmins(): Promise<number> {
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "SUPER_ADMIN" satisfies RoleKey));
  return rows.length;
}

/** Guards against removing the last active SUPER_ADMIN, per platform invariant (section 19). */
export async function assertNotLastSuperAdmin(userId: string): Promise<void> {
  const [userIsSuperAdmin, total] = await Promise.all([
    (async () => {
      const keys = await getUserRoleKeys(userId);
      return keys.includes("SUPER_ADMIN");
    })(),
    countSuperAdmins(),
  ]);
  if (userIsSuperAdmin && total <= 1) {
    throw new ForbiddenError("No se puede eliminar o degradar al último super administrador activo.");
  }
}

export async function getRoleIdsByKeys(keys: RoleKey[]): Promise<Map<RoleKey, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.key, keys));
  return new Map(rows.map((r) => [r.key as RoleKey, r.id]));
}
