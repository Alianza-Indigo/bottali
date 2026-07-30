import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db/client";
import {
  toolAccessRules,
  toolBehavior,
  toolBranding,
  toolCapabilities,
  toolModels,
  toolPwaConfigs,
  toolSafetyPolicies,
  toolVersions,
  tools,
  providers,
} from "@/db/schema";
import { NotFoundError } from "@/lib/utils/errors";
import { omit } from "@/lib/utils/object";

type Tx = DbOrTx;

export async function getToolById(toolId: string, executor: Tx = db) {
  const rows = await executor.select().from(tools).where(eq(tools.id, toolId)).limit(1);
  const tool = rows[0];
  if (!tool) throw new NotFoundError("Herramienta no encontrada.");
  return tool;
}

export async function getToolBySlug(slug: string, executor: Tx = db) {
  const rows = await executor.select().from(tools).where(eq(tools.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getVersionById(versionId: string, executor: Tx = db) {
  const rows = await executor.select().from(toolVersions).where(eq(toolVersions.id, versionId)).limit(1);
  const version = rows[0];
  if (!version) throw new NotFoundError("Versión de herramienta no encontrada.");
  return version;
}

export async function getVersionForTool(toolId: string, versionId: string, executor: Tx = db) {
  const rows = await executor
    .select()
    .from(toolVersions)
    .where(and(eq(toolVersions.id, versionId), eq(toolVersions.toolId, toolId)))
    .limit(1);
  const version = rows[0];
  if (!version) throw new NotFoundError("Versión de herramienta no encontrada.");
  return version;
}

export async function getLatestVersionNumber(toolId: string, executor: Tx = db): Promise<number> {
  const rows = await executor
    .select({ versionNumber: toolVersions.versionNumber })
    .from(toolVersions)
    .where(eq(toolVersions.toolId, toolId))
    .orderBy(desc(toolVersions.versionNumber))
    .limit(1);
  return rows[0]?.versionNumber ?? 0;
}

export interface FullVersionConfig {
  branding: typeof toolBranding.$inferSelect | null;
  behavior: typeof toolBehavior.$inferSelect | null;
  models: typeof toolModels.$inferSelect | null;
  capabilities: typeof toolCapabilities.$inferSelect | null;
  accessRules: typeof toolAccessRules.$inferSelect | null;
  safetyPolicies: typeof toolSafetyPolicies.$inferSelect | null;
  pwaConfig: typeof toolPwaConfigs.$inferSelect | null;
}

export async function loadVersionConfig(toolVersionId: string, executor: Tx = db): Promise<FullVersionConfig> {
  const [branding, behavior, models, capabilities, accessRules, safetyPolicies, pwaConfig] = await Promise.all([
    executor.select().from(toolBranding).where(eq(toolBranding.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolBehavior).where(eq(toolBehavior.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolModels).where(eq(toolModels.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolAccessRules).where(eq(toolAccessRules.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolSafetyPolicies).where(eq(toolSafetyPolicies.toolVersionId, toolVersionId)).limit(1),
    executor.select().from(toolPwaConfigs).where(eq(toolPwaConfigs.toolVersionId, toolVersionId)).limit(1),
  ]);
  return {
    branding: branding[0] ?? null,
    behavior: behavior[0] ?? null,
    models: models[0] ?? null,
    capabilities: capabilities[0] ?? null,
    accessRules: accessRules[0] ?? null,
    safetyPolicies: safetyPolicies[0] ?? null,
    pwaConfig: pwaConfig[0] ?? null,
  };
}

/** Copies every child config table from one version to another (used when creating a new
 * draft from a published version, duplicating a tool, or rolling back). Never mutates the
 * source version's rows — publish immutability depends on this being copy, not move. */
export async function copyVersionConfig(fromVersionId: string, toVersionId: string, executor: Tx): Promise<void> {
  const config = await loadVersionConfig(fromVersionId, executor);

  if (config.branding) {
    await executor.insert(toolBranding).values({ ...omit(config.branding, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.behavior) {
    await executor.insert(toolBehavior).values({ ...omit(config.behavior, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.models) {
    await executor.insert(toolModels).values({ ...omit(config.models, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.capabilities) {
    await executor.insert(toolCapabilities).values({ ...omit(config.capabilities, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.accessRules) {
    await executor.insert(toolAccessRules).values({ ...omit(config.accessRules, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.safetyPolicies) {
    await executor.insert(toolSafetyPolicies).values({ ...omit(config.safetyPolicies, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
  if (config.pwaConfig) {
    await executor.insert(toolPwaConfigs).values({ ...omit(config.pwaConfig, ["id", "toolVersionId"]), toolVersionId: toVersionId });
  }
}

export async function findPublishedVersion(toolId: string, executor: Tx = db) {
  const tool = await getToolById(toolId, executor);
  if (!tool.publishedVersionId) return null;
  return getVersionById(tool.publishedVersionId, executor);
}

export async function findDraftVersion(toolId: string, executor: Tx = db) {
  const rows = await executor
    .select()
    .from(toolVersions)
    .where(and(eq(toolVersions.toolId, toolId), eq(toolVersions.status, "DRAFT")))
    .orderBy(desc(toolVersions.versionNumber))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAdminTools(executor: Tx = db) {
  const rows = await executor.select().from(tools).orderBy(desc(tools.createdAt));
  const versionIds = rows.map((tool) => tool.draftVersionId ?? tool.publishedVersionId).filter((id): id is string => Boolean(id));
  const brandingRows =
    versionIds.length > 0
      ? await executor
          .select({ toolVersionId: toolBranding.toolVersionId, name: toolBranding.name })
          .from(toolBranding)
          .where(inArray(toolBranding.toolVersionId, versionIds))
      : [];
  const nameByVersion = new Map(brandingRows.map((branding) => [branding.toolVersionId, branding.name]));

  return rows.map((tool) => {
    const versionId = tool.draftVersionId ?? tool.publishedVersionId;
    return { ...tool, name: (versionId && nameByVersion.get(versionId)) ?? tool.slug };
  });
}

export async function getAdminToolBuilderData(toolId: string, executor: Tx = db) {
  const [tool, versions, modelProviders] = await Promise.all([
    getToolById(toolId, executor),
    executor.select().from(toolVersions).where(eq(toolVersions.toolId, toolId)),
    executor.select().from(providers),
  ]);
  return { tool, versions, modelProviders };
}
