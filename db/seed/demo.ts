import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { groupMembers, groups, roles, userProfiles, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { RoleKey } from "@/lib/permissions/definitions";

export const DEMO_CREDENTIALS = {
  superAdmin: { email: "superadmin@demo.crisis.local", password: "SuperAdmin!2026" },
  toolAdmin: { email: "tooladmin@demo.crisis.local", password: "ToolAdmin!2026" },
  user: { email: "user@demo.crisis.local", password: "DemoUser!2026" },
} as const;

async function ensureDemoUser(
  db: Database,
  email: string,
  password: string,
  displayName: string,
  roleKey: RoleKey,
): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0].id;

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), isDemo: true })
    .returning({ id: users.id });
  if (!user) throw new Error(`No fue posible crear el usuario demo ${email}`);

  await db.insert(userProfiles).values({ userId: user.id, displayName });

  const roleRow = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1);
  if (roleRow[0]) {
    await db.insert(userRoles).values({ userId: user.id, roleId: roleRow[0].id });
  }

  return user.id;
}

export async function seedDemoData(db: Database): Promise<void> {
  const superAdminId = await ensureDemoUser(
    db,
    DEMO_CREDENTIALS.superAdmin.email,
    DEMO_CREDENTIALS.superAdmin.password,
    "Super Administrador (demo)",
    "SUPER_ADMIN",
  );
  const toolAdminId = await ensureDemoUser(
    db,
    DEMO_CREDENTIALS.toolAdmin.email,
    DEMO_CREDENTIALS.toolAdmin.password,
    "Administrador de herramientas (demo)",
    "TOOL_ADMIN",
  );
  const userId = await ensureDemoUser(
    db,
    DEMO_CREDENTIALS.user.email,
    DEMO_CREDENTIALS.user.password,
    "Usuario de prueba (demo)",
    "USER",
  );

  const existingGroup = await db.select({ id: groups.id }).from(groups).where(eq(groups.name, "Equipo de demostración")).limit(1);
  const groupId =
    existingGroup[0]?.id ??
    (await db
      .insert(groups)
      .values({ name: "Equipo de demostración", description: "Grupo creado por el seed de desarrollo.", createdBy: superAdminId })
      .returning({ id: groups.id }))[0]?.id;

  if (groupId) {
    for (const memberId of [toolAdminId, userId]) {
      const existingMember = await db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)))
        .limit(1);
      if (!existingMember.length) {
        await db.insert(groupMembers).values({ groupId, userId: memberId }).onConflictDoNothing();
      }
    }
  }

  console.log("Usuarios de demostración:");
  console.table(DEMO_CREDENTIALS);
}
