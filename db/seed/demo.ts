import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { groupMembers, groups, mfaCredentials, roles, userProfiles, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/security/crypto";
import type { RoleKey } from "@/lib/permissions/definitions";

// Fixed (not random) so tests/tooling can compute a matching code with generateTotpCode() —
// admin roles now require MFA (§28) to reach /admin at all, so the demo admin accounts need
// it pre-enabled or no local/dev/e2e flow could ever log into the admin panel.
export const DEMO_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export const DEMO_CREDENTIALS = {
  superAdmin: { email: "superadmin@demo.crisis.local", password: "SuperAdmin!2026", mfaSecret: DEMO_MFA_SECRET },
  toolAdmin: { email: "tooladmin@demo.crisis.local", password: "ToolAdmin!2026", mfaSecret: DEMO_MFA_SECRET },
  user: { email: "user@demo.crisis.local", password: "DemoUser!2026" },
} as const;

async function ensureDemoUser(
  db: Database,
  email: string,
  password: string,
  displayName: string,
  roleKey: RoleKey,
  mfaSecret?: string,
): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const userId = existing[0]?.id;

  if (!userId) {
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
    if (mfaSecret) {
      await db.insert(mfaCredentials).values({
        userId: user.id,
        secretEncrypted: encryptSecret(mfaSecret),
        enabledAt: new Date(),
      });
    }
    return user.id;
  }

  if (mfaSecret) {
    const existingMfa = await db.select({ id: mfaCredentials.id }).from(mfaCredentials).where(eq(mfaCredentials.userId, userId)).limit(1);
    if (!existingMfa[0]) {
      await db.insert(mfaCredentials).values({
        userId,
        secretEncrypted: encryptSecret(mfaSecret),
        enabledAt: new Date(),
      });
    }
  }
  return userId;
}

export async function seedDemoData(db: Database): Promise<void> {
  const superAdminId = await ensureDemoUser(
    db,
    DEMO_CREDENTIALS.superAdmin.email,
    DEMO_CREDENTIALS.superAdmin.password,
    "Super Administrador (demo)",
    "SUPER_ADMIN",
    DEMO_CREDENTIALS.superAdmin.mfaSecret,
  );
  const toolAdminId = await ensureDemoUser(
    db,
    DEMO_CREDENTIALS.toolAdmin.email,
    DEMO_CREDENTIALS.toolAdmin.password,
    "Administrador de herramientas (demo)",
    "TOOL_ADMIN",
    DEMO_CREDENTIALS.toolAdmin.mfaSecret,
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
