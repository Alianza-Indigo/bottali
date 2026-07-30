import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db/client";
import {
  organizationMemberRoles,
  organizationMemberships,
  organizations,
  roles,
  sessions,
  users,
} from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/utils/errors";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_SLUG,
} from "./constants";

export async function ensureDefaultOrganization(executor: DbOrTx = db) {
  await executor
    .insert(organizations)
    .values({
      id: DEFAULT_ORGANIZATION_ID,
      slug: DEFAULT_ORGANIZATION_SLUG,
      name: "Bottali",
    })
    .onConflictDoNothing();
  return DEFAULT_ORGANIZATION_ID;
}

export async function ensureUserOrganizationMembership(
  userId: string,
  organizationId = DEFAULT_ORGANIZATION_ID,
  roleKey = "USER",
  executor: DbOrTx = db,
): Promise<void> {
  await ensureDefaultOrganization(executor);
  const existingMemberships = await executor
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId));
  await executor
    .insert(organizationMemberships)
    .values({
      organizationId,
      userId,
      isDefault: existingMemberships.length === 0,
    })
    .onConflictDoNothing();

  const role = (
    await executor.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1)
  )[0];
  if (role) {
    await executor
      .insert(organizationMemberRoles)
      .values({ organizationId, userId, roleId: role.id })
      .onConflictDoNothing();
  }
}

export async function listUserOrganizations(userId: string) {
  return db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      status: organizations.status,
      logoUrl: organizations.logoUrl,
      iconUrl: organizations.iconUrl,
      primaryColor: organizations.primaryColor,
      secondaryColor: organizations.secondaryColor,
      customDomain: organizations.customDomain,
      isDefault: organizationMemberships.isDefault,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(organizations.name));
}

export async function listAllOrganizations() {
  return db.select().from(organizations).orderBy(asc(organizations.name));
}

export async function resolveUserOrganization(
  userId: string,
  requestedOrganizationId?: string | null,
) {
  const memberships = await listUserOrganizations(userId);
  const organization =
    memberships.find((item) => item.id === requestedOrganizationId) ??
    memberships.find((item) => item.isDefault) ??
    memberships[0];
  if (organization) return organization;

  await ensureUserOrganizationMembership(userId);
  return (await listUserOrganizations(userId))[0]!;
}

export async function switchSessionOrganization(
  sessionId: string,
  userId: string,
  organizationId: string,
): Promise<void> {
  const membership = await db
    .select({ status: organizationMemberships.status })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (membership[0]?.status !== "ACTIVE") {
    throw new ForbiddenError("No perteneces a esta organización.");
  }
  await db
    .update(sessions)
    .set({ organizationId })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function createOrganization(input: {
  slug: string;
  name: string;
  actorId: string;
}) {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.slug))
    .limit(1);
  if (existing[0]) throw new ConflictError("El slug de organización ya está en uso.");

  return db.transaction(async (tx) => {
    const organization = (
      await tx
        .insert(organizations)
        .values({
          slug: input.slug,
          name: input.name,
          createdBy: input.actorId,
        })
        .returning()
    )[0];
    if (!organization) throw new Error("No fue posible crear la organización.");
    await ensureUserOrganizationMembership(
      input.actorId,
      organization.id,
      "ORGANIZATION_ADMIN",
      tx,
    );
    return organization;
  });
}

export async function getOrganizationById(organizationId: string) {
  const organization = (
    await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  )[0];
  if (!organization) throw new NotFoundError("Organización no encontrada.");
  return organization;
}

export async function listOrganizationMembers(organizationId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      status: organizationMemberships.status,
      joinedAt: organizationMemberships.joinedAt,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .leftJoin(
      organizationMemberRoles,
      and(
        eq(organizationMemberRoles.organizationId, organizationMemberships.organizationId),
        eq(organizationMemberRoles.userId, organizationMemberships.userId),
      ),
    )
    .leftJoin(roles, eq(roles.id, organizationMemberRoles.roleId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export async function addOrganizationMember(input: {
  organizationId: string;
  email: string;
  roleKey: string;
  actorId: string;
}) {
  const member = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.trim().toLowerCase()))
      .limit(1)
  )[0];
  if (!member) {
    throw new NotFoundError("La persona debe iniciar sesión al menos una vez antes de agregarla.");
  }

  const role = (
    await db
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(eq(roles.key, input.roleKey))
      .limit(1)
  )[0];
  if (!role || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(role.key)) {
    throw new ForbiddenError("El rol no se puede asignar dentro de una organización.");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMemberships)
      .values({
        organizationId: input.organizationId,
        userId: member.id,
        invitedBy: input.actorId,
      })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { status: "ACTIVE", invitedBy: input.actorId },
      });
    await tx
      .insert(organizationMemberRoles)
      .values({
        organizationId: input.organizationId,
        userId: member.id,
        roleId: role.id,
        assignedBy: input.actorId,
      })
      .onConflictDoNothing();
  });
  return { userId: member.id };
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  if (userId === actorId) {
    throw new ConflictError("No puedes quitarte a ti mismo de la organización activa.");
  }
  const deleted = await db
    .delete(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .returning({ userId: organizationMemberships.userId });
  if (!deleted[0]) throw new NotFoundError("Miembro no encontrado.");
}
