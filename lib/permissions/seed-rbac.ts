import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { PERMISSION_KEYS, ROLE_KEYS, ROLE_PERMISSIONS } from "./definitions";

/**
 * Idempotent bootstrap of the fixed roles/permissions catalog. Safe to run in every
 * environment (including production) on every deploy — required for the platform to
 * function at all (registration assigns the USER role).
 */
export async function seedRolesAndPermissions(db: Database): Promise<void> {
  const permissionIdByKey = new Map<string, string>();
  for (const key of PERMISSION_KEYS) {
    const existing = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.key, key)).limit(1);
    if (existing[0]) {
      permissionIdByKey.set(key, existing[0].id);
      continue;
    }
    const [inserted] = await db.insert(permissions).values({ key }).returning({ id: permissions.id });
    if (inserted) permissionIdByKey.set(key, inserted.id);
  }

  const roleIdByKey = new Map<string, string>();
  for (const key of ROLE_KEYS) {
    const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
    if (existing[0]) {
      roleIdByKey.set(key, existing[0].id);
      continue;
    }
    const [inserted] = await db.insert(roles).values({ key, name: key }).returning({ id: roles.id });
    if (inserted) roleIdByKey.set(key, inserted.id);
  }

  for (const roleKey of ROLE_KEYS) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) continue;
    const grantedPermissionKeys = ROLE_PERMISSIONS[roleKey];
    const existingGrants = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    const alreadyGranted = new Set(existingGrants.map((g) => g.permissionId));

    for (const permissionKey of grantedPermissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (!permissionId || alreadyGranted.has(permissionId)) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId });
    }
  }
}
