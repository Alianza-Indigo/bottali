import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluationRuns, evaluationSuites, legalDocuments, providers, tools } from "@/db/schema";
import { loadVersionConfig, getVersionById, getToolById } from "./repository";
import { ConflictError } from "@/lib/utils/errors";
import { toolHasProviderCredential } from "./provider-credentials";
import { assertToolExternalCredentialReferences } from "./external-credentials";

export interface PublishValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Automated subset of the §7 pre-publish checklist. Structural/data-completeness items
 * are enforced here (name, slug, icon, prompt, model, budget, access, safety, pwa,
 * responsible, mandatory evaluations, provider availability). Purely editorial or
 * human-judgment items (content quality of legal notices, rendered-UI accessibility
 * audits) are NOT re-derived here — those are covered by tests/accessibility and by
 * the SECURITY_REVIEWER / tools.review permission gate in the workflow itself.
 */
export async function validateVersionForPublish(toolVersionId: string): Promise<PublishValidationResult> {
  const errors: string[] = [];
  const version = await getVersionById(toolVersionId);
  const tool = await getToolById(version.toolId);
  const config = await loadVersionConfig(toolVersionId);

  if (!config.branding) {
    errors.push("Falta configurar la identidad (nombre, slug, descripción, colores, icono).");
  } else {
    if (!config.branding.name.trim()) errors.push("El nombre de la herramienta es obligatorio.");
    if (!config.branding.iconUrl) errors.push("El icono de la herramienta es obligatorio.");
    if (!config.branding.description.trim()) errors.push("La descripción breve es obligatoria.");
  }

  if (!config.behavior) {
    errors.push("Falta configurar el comportamiento (prompt, mensaje inicial, aviso de alcance).");
  } else {
    if (!config.behavior.systemPrompt.trim()) errors.push("El prompt del sistema es obligatorio.");
    if (!config.behavior.welcomeMessage.trim()) errors.push("El mensaje de bienvenida es obligatorio.");
    if (!config.behavior.scopeNotice.trim()) errors.push("El aviso de alcance es obligatorio.");
  }

  if (!config.models) {
    errors.push("Falta configurar el modelo de inteligencia artificial.");
  } else {
    if (!config.models.providerId) errors.push("Debe seleccionarse un proveedor de IA.");
    if (!config.models.primaryModelId) errors.push("Debe seleccionarse un modelo principal.");
    if (config.models.budgetMonthlyCents <= 0) errors.push("Debe definirse un presupuesto mensual mayor a cero.");

    if (config.models.providerId) {
      const providerRow = await db.select().from(providers).where(eq(providers.id, config.models.providerId)).limit(1);
      const hasToolCredential = await toolHasProviderCredential(tool.id, config.models.providerId);
      if (!providerRow[0] || (!providerRow[0].enabled && !hasToolCredential)) {
        errors.push("El proveedor de IA seleccionado no está disponible o no está habilitado.");
      }
    }
  }

  if (!config.accessRules) errors.push("Faltan las reglas de acceso.");
  if (!config.safetyPolicies) errors.push("Faltan las políticas de seguridad.");

  const credentialIds = [
    ...new Set(
      (config.capabilities?.externalApiEndpoints ?? [])
        .map((endpoint) => endpoint.credentialId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  try {
    await assertToolExternalCredentialReferences(tool.id, credentialIds);
  } catch {
    errors.push("Un endpoint externo referencia una credencial inexistente o de otra herramienta.");
  }

  if (config.capabilities?.pwa) {
    if (!config.pwaConfig) {
      errors.push("La herramienta habilita PWA pero no tiene configuración de PWA.");
    } else if (!config.pwaConfig.startUrl || !config.pwaConfig.scope) {
      errors.push("La configuración de PWA requiere start_url y scope válidos.");
    }
  }

  if (!tool.responsibleUserId) {
    errors.push("Debe asignarse un responsable de la herramienta.");
  }

  const privacyPolicy = await db.select({ id: legalDocuments.id }).from(legalDocuments).where(eq(legalDocuments.kind, "privacy_policy")).limit(1);
  if (!privacyPolicy[0]) {
    errors.push("No existe un aviso de privacidad publicado en la plataforma.");
  }

  const mandatorySuites = await db
    .select({ id: evaluationSuites.id, name: evaluationSuites.name })
    .from(evaluationSuites)
    .where(and(eq(evaluationSuites.toolId, tool.id), eq(evaluationSuites.isMandatoryForPublish, 1)));

  if (mandatorySuites.length > 0) {
    const suiteIds = mandatorySuites.map((s) => s.id);
    const runs = await db
      .select()
      .from(evaluationRuns)
      .where(and(eq(evaluationRuns.toolVersionId, toolVersionId), inArray(evaluationRuns.suiteId, suiteIds)));

    for (const suite of mandatorySuites) {
      const bestRun = runs.find((r) => r.suiteId === suite.id && r.status === "COMPLETED" && r.passed === 1);
      if (!bestRun) {
        errors.push(`La suite de evaluación obligatoria "${suite.name}" no tiene una ejecución aprobada para esta versión.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function assertSlugAvailable(slug: string, organizationId: string, excludeToolId?: string): Promise<void> {
  const rows = await db
    .select({ id: tools.id })
    .from(tools)
    .where(and(eq(tools.organizationId, organizationId), eq(tools.slug, slug)))
    .limit(1);
  if (rows[0] && rows[0].id !== excludeToolId) {
    throw new ConflictError(`El slug "${slug}" ya está en uso.`);
  }
}
