import { inArray } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  organizationMemberRoles,
  organizationMemberships,
  organizations,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_SLUG,
} from "@/lib/organizations/constants";

const PLATFORM_ROLE_KEYS = new Set(["SUPER_ADMIN", "PLATFORM_ADMIN"]);

export async function seedDefaultOrganizationAndMemberships(db: Database): Promise<void> {
  await db
    .insert(organizations)
    .values({
      id: DEFAULT_ORGANIZATION_ID,
      slug: DEFAULT_ORGANIZATION_SLUG,
      name: "Bottali",
    })
    .onConflictDoNothing();

  const [allUsers, allRoles, assignments] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: roles.id, key: roles.key }).from(roles),
    db.select().from(userRoles),
  ]);
  const roleById = new Map(allRoles.map((role) => [role.id, role]));
  const tenantRoleIds = allRoles
    .filter((role) => !PLATFORM_ROLE_KEYS.has(role.key))
    .map((role) => role.id);

  for (const user of allUsers) {
    await db
      .insert(organizationMemberships)
      .values({
        organizationId: DEFAULT_ORGANIZATION_ID,
        userId: user.id,
        isDefault: true,
      })
      .onConflictDoNothing();
  }

  for (const assignment of assignments) {
    const role = roleById.get(assignment.roleId);
    if (!role || PLATFORM_ROLE_KEYS.has(role.key)) continue;
    await db
      .insert(organizationMemberRoles)
      .values({
        organizationId: DEFAULT_ORGANIZATION_ID,
        userId: assignment.userId,
        roleId: assignment.roleId,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
      })
      .onConflictDoNothing();
  }

  if (tenantRoleIds.length > 0) {
    await db.delete(userRoles).where(inArray(userRoles.roleId, tenantRoleIds));
  }
}
