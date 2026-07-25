import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getVersionById, loadVersionConfig } from "@/lib/tools/repository";
import {
  updateAccessRules,
  updateBehavior,
  updateBranding,
  updateCapabilities,
  updateModels,
  updatePwaConfig,
  updateSafetyPolicies,
} from "@/lib/tools/service";
import {
  accessRulesSchema,
  behaviorSchema,
  brandingSchema,
  capabilitiesSchema,
  modelsSchema,
  pwaConfigSchema,
  safetyPoliciesSchema,
} from "@/lib/validation/tools";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const patchSchema = z.object({
  branding: brandingSchema.optional(),
  behavior: behaviorSchema.optional(),
  models: modelsSchema.optional(),
  capabilities: capabilitiesSchema.optional(),
  accessRules: accessRulesSchema.optional(),
  safetyPolicies: safetyPoliciesSchema.optional(),
  pwaConfig: pwaConfigSchema.optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    await requireUserWithPermission("tools.read");
    const { versionId } = await params;
    const version = await getVersionById(versionId);
    const config = await loadVersionConfig(versionId);
    return NextResponse.json({ version, config });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Applies one or more config sections to a DRAFT version in a single call — the admin
 * builder wizard (§9) can save a section at a time or several together. */
export async function PATCH(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.update");
    const { versionId } = await params;
    const body = await parseJsonBody(request, patchSchema);

    if (body.branding) await updateBranding(versionId, body.branding, user.id);
    if (body.behavior) await updateBehavior(versionId, body.behavior, user.id);
    if (body.models) await updateModels(versionId, body.models, user.id);
    if (body.capabilities) await updateCapabilities(versionId, body.capabilities, user.id);
    if (body.accessRules) await updateAccessRules(versionId, body.accessRules, user.id);
    if (body.safetyPolicies) await updateSafetyPolicies(versionId, body.safetyPolicies, user.id);
    if (body.pwaConfig) await updatePwaConfig(versionId, body.pwaConfig, user.id);

    return NextResponse.json({ message: "Configuración actualizada." });
  } catch (error) {
    return handleApiError(error);
  }
}
