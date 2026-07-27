import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db/client";
import {
  toolAccessRules,
  toolBehavior,
  toolBranding,
  toolCapabilities,
  toolModels,
  toolPublications,
  toolPwaConfigs,
  toolSafetyPolicies,
  tools,
  toolVersions,
} from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit/log";
import { ConflictError, ValidationError } from "@/lib/utils/errors";
import type { CreateToolInput, BrandingInput, BehaviorInput, ModelsInput, CapabilitiesInput, AccessRulesInput, SafetyPoliciesInput, PwaConfigInput } from "@/lib/validation/tools";
import { assertValidToolTransition, assertValidVersionTransition, isValidToolTransition, type ToolStatus, type ToolVersionStatus } from "./state-machine";
import { copyVersionConfig, getLatestVersionNumber, getToolById, getVersionById, loadVersionConfig } from "./repository";
import { assertSlugAvailable, validateVersionForPublish } from "./validation-publish";

async function insertDefaultVersionScaffold(tx: DbOrTx, toolVersionId: string, input: Pick<CreateToolInput, "name" | "shortName" | "description">) {
  await tx.insert(toolBranding).values({
    toolVersionId,
    name: input.name,
    shortName: input.shortName,
    description: input.description,
    primaryColor: "#1d4ed8",
    secondaryColor: "#0f172a",
    theme: "system",
  });
  await tx.insert(toolModels).values({ toolVersionId });
  await tx.insert(toolCapabilities).values({ toolVersionId });
  await tx.insert(toolAccessRules).values({ toolVersionId, mode: "ALL_USERS" });
  await tx.insert(toolSafetyPolicies).values({ toolVersionId, riskLevel: "LOW" });
  await tx.insert(toolPwaConfigs).values({
    toolVersionId,
    name: input.name,
    shortName: input.shortName,
    description: input.description,
    startUrl: `/tools/${input.name.toLowerCase().replace(/\s+/g, "-")}`,
    scope: "/tools/",
  });
  // toolBehavior is intentionally NOT scaffolded with defaults: its emptiness is what
  // validateVersionForPublish uses to detect an incomplete configuration (§7).
}

export async function createTool(input: CreateToolInput, actorId: string): Promise<{ toolId: string; versionId: string }> {
  await assertSlugAvailable(input.slug);

  const result = await db.transaction(async (tx) => {
    const [tool] = await tx
      .insert(tools)
      .values({ slug: input.slug, category: input.category, team: input.team, createdBy: actorId, responsibleUserId: actorId })
      .returning({ id: tools.id });
    if (!tool) throw new Error("No fue posible crear la herramienta.");

    const [version] = await tx
      .insert(toolVersions)
      .values({ toolId: tool.id, versionNumber: 1, status: "DRAFT", createdBy: actorId, changeSummary: "Versión inicial" })
      .returning({ id: toolVersions.id });
    if (!version) throw new Error("No fue posible crear la versión inicial.");

    await insertDefaultVersionScaffold(tx, version.id, input);
    await tx.update(tools).set({ draftVersionId: version.id }).where(eq(tools.id, tool.id));

    return { toolId: tool.id, versionId: version.id };
  });

  await recordAuditEvent({ actorId, action: "tool.create", resourceType: "tool", resourceId: result.toolId });
  return result;
}

/** Returns the version currently open for editing, creating a fresh DRAFT (copied from the
 * published version) if the tool has none — edits never touch a PUBLISHED version's rows. */
export async function ensureEditableDraftVersion(toolId: string, actorId: string): Promise<string> {
  const tool = await getToolById(toolId);
  if (tool.draftVersionId) {
    const activeVersion = await getVersionById(tool.draftVersionId);
    if (["DRAFT", "TESTING", "UNDER_REVIEW", "APPROVED", "SCHEDULED"].includes(activeVersion.status)) {
      return activeVersion.id;
    }
  }

  const sourceVersionId = tool.publishedVersionId;
  if (!sourceVersionId) throw new ConflictError("La herramienta no tiene una versión base para editar.");

  return db.transaction(async (tx) => {
    const nextNumber = (await getLatestVersionNumber(toolId, tx)) + 1;
    const [version] = await tx
      .insert(toolVersions)
      .values({ toolId, versionNumber: nextNumber, status: "DRAFT", createdBy: actorId, changeSummary: "Nuevo borrador" })
      .returning({ id: toolVersions.id });
    if (!version) throw new Error("No fue posible crear el nuevo borrador.");

    await copyVersionConfig(sourceVersionId, version.id, tx);
    await tx.update(tools).set({ draftVersionId: version.id }).where(eq(tools.id, toolId));
    return version.id;
  });
}

async function assertVersionIsDraft(toolVersionId: string): Promise<void> {
  const version = await getVersionById(toolVersionId);
  if (version.status !== "DRAFT") {
    throw new ConflictError("Solo se puede editar una versión en estado DRAFT.");
  }
}

export async function updateBranding(toolVersionId: string, input: BrandingInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db
    .update(toolBranding)
    .set({ ...input, iconUrl: input.iconUrl || null, logoUrl: input.logoUrl || null, coverImageUrl: input.coverImageUrl || null })
    .where(eq(toolBranding.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.branding", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updateBehavior(toolVersionId: string, input: BehaviorInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  const existing = await db.select({ id: toolBehavior.id }).from(toolBehavior).where(eq(toolBehavior.toolVersionId, toolVersionId)).limit(1);
  if (existing[0]) {
    await db.update(toolBehavior).set(input).where(eq(toolBehavior.toolVersionId, toolVersionId));
  } else {
    await db.insert(toolBehavior).values({ ...input, toolVersionId });
  }
  await recordAuditEvent({ actorId, action: "tool.update.behavior", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updateModels(toolVersionId: string, input: ModelsInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db
    .update(toolModels)
    .set({ ...input, temperature: String(input.temperature), topP: String(input.topP) })
    .where(eq(toolModels.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.models", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updateCapabilities(toolVersionId: string, input: CapabilitiesInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db.update(toolCapabilities).set(input).where(eq(toolCapabilities.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.capabilities", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updateAccessRules(toolVersionId: string, input: AccessRulesInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db
    .update(toolAccessRules)
    .set({
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    })
    .where(eq(toolAccessRules.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.access_rules", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updateSafetyPolicies(toolVersionId: string, input: SafetyPoliciesInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db.update(toolSafetyPolicies).set(input).where(eq(toolSafetyPolicies.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.safety_policies", resourceType: "tool_version", resourceId: toolVersionId });
}

export async function updatePwaConfig(toolVersionId: string, input: PwaConfigInput, actorId: string): Promise<void> {
  await assertVersionIsDraft(toolVersionId);
  await db.update(toolPwaConfigs).set(input).where(eq(toolPwaConfigs.toolVersionId, toolVersionId));
  await recordAuditEvent({ actorId, action: "tool.update.pwa_config", resourceType: "tool_version", resourceId: toolVersionId });
}

interface TransitionOptions {
  reason?: string;
}

export async function transitionToolStatus(toolId: string, to: ToolStatus, actorId: string, options: TransitionOptions = {}): Promise<void> {
  const tool = await getToolById(toolId);
  assertValidToolTransition(tool.status as ToolStatus, to);
  await db.update(tools).set({ status: to, updatedAt: new Date() }).where(eq(tools.id, toolId));
  await recordAuditEvent({
    actorId,
    action: `tool.transition.${to.toLowerCase()}`,
    resourceType: "tool",
    resourceId: toolId,
    reason: options.reason,
    metadata: { from: tool.status, to },
  });
}

export async function publishVersion(toolVersionId: string, actorId: string, options: { scheduledFor?: Date } = {}): Promise<void> {
  const version = await getVersionById(toolVersionId);
  const tool = await getToolById(version.toolId);

  // Idempotent: publishing an already-published version is a safe no-op.
  if (version.status === "PUBLISHED" && tool.publishedVersionId === version.id) return;

  const validation = await validateVersionForPublish(toolVersionId);
  if (!validation.valid) {
    throw new ValidationError("La versión no cumple los requisitos mínimos para publicarse.", validation.errors);
  }

  const targetToolStatus: ToolStatus = options.scheduledFor ? "SCHEDULED" : "PUBLISHED";
  assertValidToolTransition(tool.status as ToolStatus, targetToolStatus);

  await db.transaction(async (tx) => {
    if (tool.publishedVersionId && tool.publishedVersionId !== version.id) {
      await tx
        .update(toolVersions)
        .set({ status: "SUPERSEDED", supersededAt: new Date() })
        .where(eq(toolVersions.id, tool.publishedVersionId));
    }

    await tx
      .update(toolVersions)
      .set({
        status: options.scheduledFor ? "SCHEDULED" : "PUBLISHED",
        scheduledFor: options.scheduledFor ?? null,
        publishedAt: options.scheduledFor ? null : new Date(),
      })
      .where(eq(toolVersions.id, version.id));

    await tx
      .update(tools)
      .set({
        status: targetToolStatus,
        publishedVersionId: options.scheduledFor ? tool.publishedVersionId : version.id,
        draftVersionId: null,
        updatedAt: new Date(),
      })
      .where(eq(tools.id, tool.id));

    await tx.insert(toolPublications).values({
      toolId: tool.id,
      toolVersionId: version.id,
      publishedBy: actorId,
      action: options.scheduledFor ? "schedule" : "publish",
      scheduledFor: options.scheduledFor ?? null,
      executedAt: options.scheduledFor ? null : new Date(),
    });
  });

  await recordAuditEvent({
    actorId,
    action: options.scheduledFor ? "tool.version.schedule" : "tool.version.publish",
    resourceType: "tool_version",
    resourceId: version.id,
    metadata: { toolId: tool.id, scheduledFor: options.scheduledFor?.toISOString() },
  });
}

/** Called by the publications cron (§6/§34): publishes any version whose scheduled time has arrived. */
export async function processScheduledPublications(): Promise<{ published: number }> {
  const due = await db
    .select()
    .from(toolVersions)
    .where(eq(toolVersions.status, "SCHEDULED"));

  let published = 0;
  for (const version of due) {
    if (!version.scheduledFor || version.scheduledFor.getTime() > Date.now()) continue;
    await publishVersion(version.id, version.createdBy ?? "system", {});
    published += 1;
  }
  return { published };
}

export async function pauseTool(toolId: string, actorId: string, reason?: string): Promise<void> {
  await transitionToolStatus(toolId, "PAUSED", actorId, { reason });
}

export async function resumeTool(toolId: string, actorId: string): Promise<void> {
  await transitionToolStatus(toolId, "PUBLISHED", actorId);
}

export async function suspendTool(toolId: string, actorId: string, reason: string): Promise<void> {
  await transitionToolStatus(toolId, "SUSPENDED", actorId, { reason });
}

export async function archiveTool(toolId: string, actorId: string, reason?: string): Promise<void> {
  await transitionToolStatus(toolId, "ARCHIVED", actorId, { reason });
  await db.update(tools).set({ archivedAt: new Date() }).where(eq(tools.id, toolId));
}

/** Rollback never mutates the old published version — it creates a brand-new version with
 * that version's configuration and publishes it, preserving full immutable version history. */
export async function rollbackToVersion(toolId: string, targetVersionId: string, actorId: string): Promise<{ newVersionId: string }> {
  const targetVersion = await getVersionById(targetVersionId);
  if (targetVersion.toolId !== toolId) throw new ConflictError("La versión no pertenece a esta herramienta.");

  const newVersionId = await db.transaction(async (tx) => {
    const nextNumber = (await getLatestVersionNumber(toolId, tx)) + 1;
    const [version] = await tx
      .insert(toolVersions)
      .values({
        toolId,
        versionNumber: nextNumber,
        status: "DRAFT",
        createdBy: actorId,
        changeSummary: `Rollback a la versión ${targetVersion.versionNumber}`,
      })
      .returning({ id: toolVersions.id });
    if (!version) throw new Error("No fue posible crear la versión de rollback.");
    await copyVersionConfig(targetVersionId, version.id, tx);
    return version.id;
  });

  await publishVersion(newVersionId, actorId);

  await recordAuditEvent({
    actorId,
    action: "tool.version.rollback",
    resourceType: "tool_version",
    resourceId: newVersionId,
    metadata: { toolId, fromVersionId: targetVersionId },
  });

  return { newVersionId };
}

export async function duplicateTool(toolId: string, newSlug: string, actorId: string): Promise<{ toolId: string; versionId: string }> {
  await assertSlugAvailable(newSlug);
  const sourceTool = await getToolById(toolId);
  const sourceVersionId = sourceTool.draftVersionId ?? sourceTool.publishedVersionId;
  if (!sourceVersionId) throw new ConflictError("La herramienta de origen no tiene una versión para duplicar.");

  const result = await db.transaction(async (tx) => {
    const [tool] = await tx
      .insert(tools)
      .values({
        slug: newSlug,
        category: sourceTool.category,
        team: sourceTool.team,
        responsibleUserId: sourceTool.responsibleUserId,
        createdBy: actorId,
      })
      .returning({ id: tools.id });
    if (!tool) throw new Error("No fue posible duplicar la herramienta.");

    const [version] = await tx
      .insert(toolVersions)
      .values({ toolId: tool.id, versionNumber: 1, status: "DRAFT", createdBy: actorId, changeSummary: `Duplicado de ${sourceTool.slug}` })
      .returning({ id: toolVersions.id });
    if (!version) throw new Error("No fue posible crear la versión duplicada.");

    await copyVersionConfig(sourceVersionId, version.id, tx);
    await tx.update(tools).set({ draftVersionId: version.id }).where(eq(tools.id, tool.id));

    return { toolId: tool.id, versionId: version.id };
  });

  await recordAuditEvent({
    actorId,
    action: "tool.duplicate",
    resourceType: "tool",
    resourceId: result.toolId,
    metadata: { sourceToolId: toolId },
  });

  return result;
}

export async function compareVersions(versionAId: string, versionBId: string) {
  const [a, b] = await Promise.all([loadVersionConfig(versionAId), loadVersionConfig(versionBId)]);

  const sections = ["branding", "behavior", "models", "capabilities", "accessRules", "safetyPolicies", "pwaConfig"] as const;
  const diff: Record<string, { changed: string[] }> = {};

  for (const section of sections) {
    const left = a[section] as Record<string, unknown> | null;
    const right = b[section] as Record<string, unknown> | null;
    const changedKeys = new Set<string>();
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
    for (const key of keys) {
      if (key === "id" || key === "toolVersionId") continue;
      if (JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key])) changedKeys.add(key);
    }
    diff[section] = { changed: Array.from(changedKeys) };
  }

  return diff;
}

async function transitionVersionStatus(versionId: string, to: ToolVersionStatus, actorId: string, action: string): Promise<void> {
  const version = await getVersionById(versionId);
  assertValidVersionTransition(version.status as ToolVersionStatus, to);
  if (version.status === to) return; // idempotent no-op
  await db.update(toolVersions).set({ status: to }).where(eq(toolVersions.id, versionId));
  await recordAuditEvent({ actorId, action, resourceType: "tool_version", resourceId: versionId, metadata: { from: version.status, to } });
}

/** Tool-level statuses that represent "not yet ever published" — the pre-publish ladder.
 * Once a tool has PUBLISHED at least once, its status reflects the *serving* lifecycle
 * (PUBLISHED/PAUSED/SUSPENDED/ARCHIVED) and must not regress just because a later draft
 * version is being tested/reviewed behind the scenes. */
const PRE_PUBLISH_TOOL_STATUSES: ToolStatus[] = [
  "DRAFT",
  "CONFIGURATION_INCOMPLETE",
  "INTERNAL_TESTING",
  "UNDER_REVIEW",
  "APPROVED",
  "SCHEDULED",
];

async function advanceToolStatusForDraftProgress(toolId: string, target: ToolStatus): Promise<void> {
  const tool = await getToolById(toolId);
  const current = tool.status as ToolStatus;
  if (!PRE_PUBLISH_TOOL_STATUSES.includes(current)) return; // already published at least once — leave as-is
  if (!isValidToolTransition(current, target)) return; // not a meaningful step from here, skip silently
  await db.update(tools).set({ status: target, updatedAt: new Date() }).where(eq(tools.id, toolId));
}

export async function markVersionTesting(versionId: string, actorId: string): Promise<void> {
  await transitionVersionStatus(versionId, "TESTING", actorId, "tool.version.test");
  await advanceToolStatusForDraftProgress((await getVersionById(versionId)).toolId, "INTERNAL_TESTING");
}

export async function markVersionUnderReview(versionId: string, actorId: string): Promise<void> {
  await transitionVersionStatus(versionId, "UNDER_REVIEW", actorId, "tool.version.review");
  await advanceToolStatusForDraftProgress((await getVersionById(versionId)).toolId, "UNDER_REVIEW");
}

export async function approveVersion(versionId: string, actorId: string): Promise<void> {
  await transitionVersionStatus(versionId, "APPROVED", actorId, "tool.version.approve");
  await advanceToolStatusForDraftProgress((await getVersionById(versionId)).toolId, "APPROVED");
}
