import "./load-env";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { roles, userRoles, users } from "@/db/schema";
import { hashPassword, evaluatePasswordStrength } from "@/lib/auth/password";

/**
 * Idempotent super-admin bootstrap: creates the account (or resets its password if it
 * already exists) and grants SUPER_ADMIN. Reads the password from an env var rather than
 * a CLI arg or a hardcoded value so it never ends up in shell history or source control.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=you@example.org BOOTSTRAP_ADMIN_PASSWORD='...' npm run admin:promote
 */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Uso: BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... npm run admin:promote");
    process.exit(1);
  }

  const strength = evaluatePasswordStrength(password);
  if (!strength.valid) {
    console.error("La contraseña no cumple los requisitos mínimos:", strength.reasons.join(" "));
    process.exit(1);
  }

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "SUPER_ADMIN")).limit(1);
  if (!role) {
    console.error('Rol SUPER_ADMIN no encontrado. Corre "npm run db:seed" primero.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({ passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    console.log(`Usuario existente actualizado: ${normalizedEmail}`);
  } else {
    const [inserted] = await db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    if (!inserted) throw new Error("No fue posible crear el usuario.");
    userId = inserted.id;
    console.log(`Usuario creado: ${normalizedEmail}`);
  }

  const [alreadyGranted] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
  if (!alreadyGranted) {
    await db.insert(userRoles).values({ userId, roleId: role.id });
  }
  console.log(`Rol SUPER_ADMIN asegurado para ${normalizedEmail}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fallo al promover al administrador:", error);
    process.exit(1);
  });
