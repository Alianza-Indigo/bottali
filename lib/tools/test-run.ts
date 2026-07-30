import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerModels, providers } from "@/db/schema";
import { getVersionById, loadVersionConfig } from "./repository";
import { getToolLLMProvider, toolHasProviderCredential } from "./provider-credentials";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";

export interface TestRunResult {
  reply: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/** §41: lets an admin exercise a draft version's prompt/model configuration end-to-end
 * (real provider call, real token accounting) before it is ever exposed to end users. */
export async function runToolTest(toolVersionId: string, userMessage: string): Promise<TestRunResult> {
  const [config, version] = await Promise.all([
    loadVersionConfig(toolVersionId),
    getVersionById(toolVersionId),
  ]);
  if (!config.behavior) {
    throw new ValidationError("La herramienta no tiene un prompt configurado todavía.");
  }
  if (!config.models?.primaryModelId) {
    throw new ValidationError("La herramienta no tiene un modelo principal configurado.");
  }

  const modelRows = await db
    .select({ model: providerModels, providerKey: providers.key, providerEnabled: providers.enabled })
    .from(providerModels)
    .innerJoin(providers, eq(providers.id, providerModels.providerId))
    .where(eq(providerModels.id, config.models.primaryModelId))
    .limit(1);
  const selected = modelRows[0];
  const model = selected?.model;
  if (!model) throw new NotFoundError("El modelo configurado ya no existe.");
  const hasToolCredential = await toolHasProviderCredential(version.toolId, model.providerId);
  if (!selected.providerEnabled && !hasToolCredential) {
    throw new ValidationError("El proveedor configurado no está disponible.");
  }

  const provider = await getToolLLMProvider(version.toolId, selected.providerKey);
  const result = await provider.generate({
    model: model.modelKey,
    messages: [
      { role: "system", content: config.behavior.systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: config.models.temperature ? Number(config.models.temperature) : undefined,
    topP: config.models.topP ? Number(config.models.topP) : undefined,
    maxOutputTokens: config.models.maxOutputTokens,
  });

  return {
    reply: result.content,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: result.latencyMs,
  };
}
