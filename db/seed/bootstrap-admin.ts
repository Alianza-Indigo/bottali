import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { roles, userRoles, users } from "@/db/schema";

const BOOTSTRAP_ADMIN_EMAIL = "mossomex@gmail.com";
// argon2id hash of the account's real password — one-way, safe to commit. Generated with
// the same hashPassword() helper/params used by the regular auth flow (lib/auth/password.ts).
const BOOTSTRAP_ADMIN_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$/FDEvALPayioXJveUDj1Kw$aAEk64kGVyhfeEQGjyQQGLm7qQEIRdtt9apIrDZqDH8";

/**
 * Idempotent, runs in every environment (including production) on every db:seed: ensures the
 * platform's initial SUPER_ADMIN account exists so there's a way into /admin on a fresh
 * deploy without a manual DB command. Safe to commit — only the password hash lives here.
 */
export async function seedBootstrapSuperAdmin(db: Database): Promise<void> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "SUPER_ADMIN")).limit(1);
  if (!role) return;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, BOOTSTRAP_ADMIN_EMAIL)).limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const [inserted] = await db
      .insert(users)
      .values({ email: BOOTSTRAP_ADMIN_EMAIL, passwordHash: BOOTSTRAP_ADMIN_PASSWORD_HASH, status: "ACTIVE", emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    if (!inserted) return;
    userId = inserted.id;
  }

  const [alreadyGranted] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
  if (!alreadyGranted) {
    await db.insert(userRoles).values({ userId, roleId: role.id });
  }
}
