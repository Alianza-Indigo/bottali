import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accessRequests, groupMembers, toolAccessRules, toolActivations, toolAssignments, tools, userRoles } from "@/db/schema";
import { getVersionById } from "./repository";

async function isActivatedByUser(toolId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: toolActivations.id })
    .from(toolActivations)
    .where(and(eq(toolActivations.toolId, toolId), eq(toolActivations.userId, userId), isNull(toolActivations.deactivatedAt)))
    .limit(1);
  return rows.length > 0;
}

export type CatalogState =
  | "AVAILABLE"
  | "ACTIVE"
  | "ACCESS_REQUESTED"
  | "APPROVAL_REQUIRED"
  | "INVITATION_ONLY"
  | "COMING_SOON"
  | "PAUSED"
  | "SUSPENDED"
  | "EXPIRED";

interface ResolveArgs {
  toolId: string;
  userId: string;
}

/**
 * §21: assignment priority is explicit — an administrative DENY always wins over any
 * ALLOW granted through a broader rule (all-users, group, or role). We therefore check
 * every DENY assignment scoped to the user (direct, by group, or by role) before
 * evaluating the tool's general access mode.
 */
async function hasExplicitDenial(toolId: string, userId: string): Promise<boolean> {
  const userGroups = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId));
  const userRoleRows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));

  const assignments = await db.select().from(toolAssignments).where(and(eq(toolAssignments.toolId, toolId), eq(toolAssignments.decision, "DENY")));

  const groupIds = new Set(userGroups.map((g) => g.groupId));
  const roleIds = new Set(userRoleRows.map((r) => r.roleId));

  return assignments.some((a) => {
    if (a.subjectType === "USER" && a.userId === userId) return true;
    if (a.subjectType === "GROUP" && a.groupId && groupIds.has(a.groupId)) return true;
    if (a.subjectType === "ROLE" && a.roleId && roleIds.has(a.roleId)) return true;
    return false;
  });
}

async function hasExplicitAllow(toolId: string, userId: string): Promise<boolean> {
  const userGroups = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId));
  const userRoleRows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  const assignments = await db.select().from(toolAssignments).where(and(eq(toolAssignments.toolId, toolId), eq(toolAssignments.decision, "ALLOW")));

  const groupIds = new Set(userGroups.map((g) => g.groupId));
  const roleIds = new Set(userRoleRows.map((r) => r.roleId));

  return assignments.some((a) => {
    if (a.subjectType === "USER" && a.userId === userId) return true;
    if (a.subjectType === "GROUP" && a.groupId && groupIds.has(a.groupId)) return true;
    if (a.subjectType === "ROLE" && a.roleId && roleIds.has(a.roleId)) return true;
    return false;
  });
}

export async function resolveCatalogState({ toolId, userId }: ResolveArgs): Promise<CatalogState> {
  const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
  const row = tool[0];
  if (!row) throw new Error("Herramienta no encontrada.");

  if (row.status === "PAUSED") return "PAUSED";
  if (row.status === "SUSPENDED") return "SUSPENDED";
  if (row.status !== "PUBLISHED") return "COMING_SOON";

  if (await hasExplicitDenial(toolId, userId)) return "SUSPENDED";

  const publishedVersion = row.publishedVersionId ? await getVersionById(row.publishedVersionId) : null;
  const accessRuleRows = publishedVersion
    ? await db.select().from(toolAccessRules).where(eq(toolAccessRules.toolVersionId, publishedVersion.id)).limit(1)
    : [];
  const accessRule = accessRuleRows[0];

  if (accessRule?.startsAt && accessRule.startsAt.getTime() > Date.now()) return "COMING_SOON";
  if (accessRule?.endsAt && accessRule.endsAt.getTime() < Date.now()) return "EXPIRED";

  const explicitlyAllowed = await hasExplicitAllow(toolId, userId);
  const activated = await isActivatedByUser(toolId, userId);

  if (explicitlyAllowed) return activated ? "ACTIVE" : "AVAILABLE";

  const existingRequest = await db
    .select({ status: accessRequests.status })
    .from(accessRequests)
    .where(and(eq(accessRequests.toolId, toolId), eq(accessRequests.userId, userId)))
    .limit(1);

  switch (accessRule?.mode ?? "ALL_USERS") {
    case "ALL_USERS":
      return activated ? "ACTIVE" : "AVAILABLE";
    case "INVITATION":
      if (existingRequest[0]?.status !== "APPROVED") return "INVITATION_ONLY";
      return activated ? "ACTIVE" : "AVAILABLE";
    case "REQUEST_APPROVAL":
    case "SELECTED_USERS":
    case "GROUPS":
    case "ROLES":
      if (existingRequest[0]?.status === "APPROVED") return activated ? "ACTIVE" : "AVAILABLE";
      if (existingRequest[0]?.status === "PENDING") return "ACCESS_REQUESTED";
      return "APPROVAL_REQUIRED";
    default:
      return "APPROVAL_REQUIRED";
  }
}

/**
 * Batched sibling of resolveCatalogState (§46 "evita consultas N+1"): the catalog page/API
 * needs this decision for every published tool at once, and calling resolveCatalogState in a
 * loop means ~7 queries PER tool. This does the same handful of lookups but scoped to the
 * whole toolIds list at once, then replays the identical branch-by-branch decision logic
 * per tool from in-memory maps — no per-tool DB round trip. Kept as a separate function
 * (rather than refactoring resolveCatalogState to share code) specifically so the
 * well-tested single-tool path is never touched; tests/integration/tools-lifecycle.test.ts
 * asserts the two agree tool-by-tool.
 */
export async function resolveCatalogStates(toolIds: string[], userId: string): Promise<Map<string, CatalogState>> {
  const result = new Map<string, CatalogState>();
  if (toolIds.length === 0) return result;

  const [toolRows, userGroups, userRoleRows, deniedAssignments, allowedAssignments, activations, requests] = await Promise.all([
    db.select().from(tools).where(inArray(tools.id, toolIds)),
    db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId)),
    db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId)),
    db.select().from(toolAssignments).where(and(inArray(toolAssignments.toolId, toolIds), eq(toolAssignments.decision, "DENY"))),
    db.select().from(toolAssignments).where(and(inArray(toolAssignments.toolId, toolIds), eq(toolAssignments.decision, "ALLOW"))),
    db
      .select({ toolId: toolActivations.toolId })
      .from(toolActivations)
      .where(and(inArray(toolActivations.toolId, toolIds), eq(toolActivations.userId, userId), isNull(toolActivations.deactivatedAt))),
    db.select().from(accessRequests).where(and(inArray(accessRequests.toolId, toolIds), eq(accessRequests.userId, userId))),
  ]);

  const groupIds = new Set(userGroups.map((g) => g.groupId));
  const roleIds = new Set(userRoleRows.map((r) => r.roleId));
  const activatedToolIds = new Set(activations.map((a) => a.toolId));
  const requestByTool = new Map(requests.map((r) => [r.toolId, r]));

  const matchesUser = (a: (typeof deniedAssignments)[number]) =>
    (a.subjectType === "USER" && a.userId === userId) ||
    (a.subjectType === "GROUP" && !!a.groupId && groupIds.has(a.groupId)) ||
    (a.subjectType === "ROLE" && !!a.roleId && roleIds.has(a.roleId));
  const deniedToolIds = new Set(deniedAssignments.filter(matchesUser).map((a) => a.toolId));
  const allowedToolIds = new Set(allowedAssignments.filter(matchesUser).map((a) => a.toolId));

  const publishedVersionIds = toolRows.map((t) => t.publishedVersionId).filter((id): id is string => Boolean(id));
  const accessRuleRows =
    publishedVersionIds.length > 0
      ? await db.select().from(toolAccessRules).where(inArray(toolAccessRules.toolVersionId, publishedVersionIds))
      : [];
  const accessRuleByVersion = new Map(accessRuleRows.map((r) => [r.toolVersionId, r]));

  for (const row of toolRows) {
    if (row.status === "PAUSED") {
      result.set(row.id, "PAUSED");
      continue;
    }
    if (row.status === "SUSPENDED") {
      result.set(row.id, "SUSPENDED");
      continue;
    }
    if (row.status !== "PUBLISHED") {
      result.set(row.id, "COMING_SOON");
      continue;
    }
    if (deniedToolIds.has(row.id)) {
      result.set(row.id, "SUSPENDED");
      continue;
    }

    const accessRule = row.publishedVersionId ? accessRuleByVersion.get(row.publishedVersionId) : undefined;
    if (accessRule?.startsAt && accessRule.startsAt.getTime() > Date.now()) {
      result.set(row.id, "COMING_SOON");
      continue;
    }
    if (accessRule?.endsAt && accessRule.endsAt.getTime() < Date.now()) {
      result.set(row.id, "EXPIRED");
      continue;
    }

    const activated = activatedToolIds.has(row.id);
    if (allowedToolIds.has(row.id)) {
      result.set(row.id, activated ? "ACTIVE" : "AVAILABLE");
      continue;
    }

    const existingRequest = requestByTool.get(row.id);
    switch (accessRule?.mode ?? "ALL_USERS") {
      case "ALL_USERS":
        result.set(row.id, activated ? "ACTIVE" : "AVAILABLE");
        break;
      case "INVITATION":
        result.set(row.id, existingRequest?.status !== "APPROVED" ? "INVITATION_ONLY" : activated ? "ACTIVE" : "AVAILABLE");
        break;
      case "REQUEST_APPROVAL":
      case "SELECTED_USERS":
      case "GROUPS":
      case "ROLES":
        if (existingRequest?.status === "APPROVED") result.set(row.id, activated ? "ACTIVE" : "AVAILABLE");
        else if (existingRequest?.status === "PENDING") result.set(row.id, "ACCESS_REQUESTED");
        else result.set(row.id, "APPROVAL_REQUIRED");
        break;
      default:
        result.set(row.id, "APPROVAL_REQUIRED");
    }
  }

  return result;
}

/** True once the tool is both authorized for this user AND explicitly activated by them —
 * this is the gate actually enforced by the conversation pipeline (§12 step 3). */
export async function canUserAccessTool(toolId: string, userId: string): Promise<boolean> {
  const state = await resolveCatalogState({ toolId, userId });
  return state === "ACTIVE";
}

export async function activateToolForUser(toolId: string, userId: string): Promise<void> {
  const state = await resolveCatalogState({ toolId, userId });
  if (state !== "AVAILABLE" && state !== "ACTIVE") {
    throw new Error("El usuario no está autorizado para activar esta herramienta.");
  }
  const existing = await db
    .select({ id: toolActivations.id })
    .from(toolActivations)
    .where(and(eq(toolActivations.toolId, toolId), eq(toolActivations.userId, userId)))
    .limit(1);
  if (existing[0]) {
    await db.update(toolActivations).set({ deactivatedAt: null, activatedAt: new Date() }).where(eq(toolActivations.id, existing[0].id));
  } else {
    await db.insert(toolActivations).values({ toolId, userId });
  }
}

export async function deactivateToolForUser(toolId: string, userId: string): Promise<void> {
  await db
    .update(toolActivations)
    .set({ deactivatedAt: new Date() })
    .where(and(eq(toolActivations.toolId, toolId), eq(toolActivations.userId, userId)));
}

export async function requestToolAccess(toolId: string, userId: string, reason?: string): Promise<void> {
  const state = await resolveCatalogState({ toolId, userId });
  if (state !== "APPROVAL_REQUIRED" && state !== "INVITATION_ONLY") {
    throw new Error("Esta herramienta no requiere solicitud de acceso.");
  }
  const existing = await db
    .select({ id: accessRequests.id, status: accessRequests.status })
    .from(accessRequests)
    .where(and(eq(accessRequests.toolId, toolId), eq(accessRequests.userId, userId)))
    .limit(1);
  if (existing[0]) {
    if (existing[0].status === "PENDING") return; // idempotent
    await db.update(accessRequests).set({ status: "PENDING", reason, reviewedBy: null, reviewedAt: null }).where(eq(accessRequests.id, existing[0].id));
    return;
  }
  await db.insert(accessRequests).values({ toolId, userId, reason });
}
