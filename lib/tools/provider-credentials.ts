import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providers, toolProviderCredentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import {
  getEmbeddingProvider,
  getLLMProvider,
  getModerationProvider,
  getSTTProvider,
  getTTSProvider,
} from "@/lib/ai/registry";
import type {
  EmbeddingProvider,
  LLMProvider,
  ModerationProvider,
  ModerationResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from "@/lib/ai/types";
import { getToolById } from "./repository";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export const TOOL_CREDENTIAL_PROVIDER_KEYS = [
  "llm:gemini",
  "llm:openai-compatible",
  "embedding:openai-compatible",
  "moderation:openai-compatible",
  "stt:openai-compatible",
  "tts:openai-compatible",
] as const;

function supportsToolCredentials(providerKey: string): boolean {
  return TOOL_CREDENTIAL_PROVIDER_KEYS.includes(
    providerKey as (typeof TOOL_CREDENTIAL_PROVIDER_KEYS)[number],
  );
}

function keyHint(apiKey: string): string {
  const suffix = apiKey.slice(-4);
  return suffix ? `••••${suffix}` : "••••";
}

export async function listToolProviderCredentials(toolId: string) {
  await getToolById(toolId);
  return db
    .select({
      providerId: toolProviderCredentials.providerId,
      providerKey: providers.key,
      providerName: providers.name,
      keyHint: toolProviderCredentials.keyHint,
      baseUrl: toolProviderCredentials.baseUrl,
      lastTestedAt: toolProviderCredentials.lastTestedAt,
      lastTestStatus: toolProviderCredentials.lastTestStatus,
      updatedAt: toolProviderCredentials.updatedAt,
    })
    .from(toolProviderCredentials)
    .innerJoin(providers, eq(providers.id, toolProviderCredentials.providerId))
    .where(eq(toolProviderCredentials.toolId, toolId));
}

export async function saveToolProviderCredential(input: {
  toolId: string;
  providerId: string;
  apiKey?: string;
  baseUrl?: string | null;
  actorId: string;
}): Promise<void> {
  await getToolById(input.toolId);
  const providerRows = await db
    .select({ key: providers.key, kind: providers.kind })
    .from(providers)
    .where(eq(providers.id, input.providerId))
    .limit(1);
  const provider = providerRows[0];
  if (!provider) throw new NotFoundError("Proveedor no encontrado.");
  if (!supportsToolCredentials(provider.key)) {
    throw new ValidationError("Este proveedor todavía no admite credenciales por herramienta.");
  }

  const existingRows = await db
    .select({ apiKeyEncrypted: toolProviderCredentials.apiKeyEncrypted })
    .from(toolProviderCredentials)
    .where(
      and(
        eq(toolProviderCredentials.toolId, input.toolId),
        eq(toolProviderCredentials.providerId, input.providerId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing && !input.apiKey) throw new ValidationError("Ingresa una clave API.");

  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : existing!.apiKeyEncrypted;
  const hint = input.apiKey ? keyHint(input.apiKey) : undefined;
  await db
    .insert(toolProviderCredentials)
    .values({
      toolId: input.toolId,
      providerId: input.providerId,
      apiKeyEncrypted: encrypted,
      keyHint: hint ?? keyHint(decryptSecret(encrypted)),
      baseUrl:
        provider.key.endsWith(":openai-compatible")
          ? input.baseUrl?.replace(/\/+$/, "") ?? null
          : null,
    })
    .onConflictDoUpdate({
      target: [toolProviderCredentials.toolId, toolProviderCredentials.providerId],
      set: {
        apiKeyEncrypted: encrypted,
        ...(hint ? { keyHint: hint } : {}),
        baseUrl:
          provider.key.endsWith(":openai-compatible")
            ? input.baseUrl?.replace(/\/+$/, "") ?? null
            : null,
        lastTestedAt: null,
        lastTestStatus: null,
        updatedAt: new Date(),
      },
    });

  await recordAuditEvent({
    actorId: input.actorId,
    action: "tool.provider_credential.update",
    resourceType: "tool",
    resourceId: input.toolId,
    metadata: { providerId: input.providerId },
  });
}

export async function deleteToolProviderCredential(input: {
  toolId: string;
  providerId: string;
  actorId: string;
}): Promise<void> {
  await getToolById(input.toolId);
  await db
    .delete(toolProviderCredentials)
    .where(
      and(
        eq(toolProviderCredentials.toolId, input.toolId),
        eq(toolProviderCredentials.providerId, input.providerId),
      ),
    );
  await recordAuditEvent({
    actorId: input.actorId,
    action: "tool.provider_credential.delete",
    resourceType: "tool",
    resourceId: input.toolId,
    metadata: { providerId: input.providerId },
  });
}

async function loadToolProviderCredential(toolId: string, providerKey: string) {
  const rows = await db
    .select({
      id: toolProviderCredentials.id,
      apiKeyEncrypted: toolProviderCredentials.apiKeyEncrypted,
      baseUrl: toolProviderCredentials.baseUrl,
    })
    .from(toolProviderCredentials)
    .innerJoin(providers, eq(providers.id, toolProviderCredentials.providerId))
    .where(and(eq(toolProviderCredentials.toolId, toolId), eq(providers.key, providerKey)))
    .limit(1);
  return rows[0] ?? null;
}

async function loadToolCredentialByKind(toolId: string, kind: string) {
  const rows = await db
    .select({
      providerKey: providers.key,
      apiKeyEncrypted: toolProviderCredentials.apiKeyEncrypted,
      baseUrl: toolProviderCredentials.baseUrl,
    })
    .from(toolProviderCredentials)
    .innerJoin(providers, eq(providers.id, toolProviderCredentials.providerId))
    .where(and(eq(toolProviderCredentials.toolId, toolId), eq(providers.kind, kind)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getToolLLMProvider(toolId: string, providerKey: string): Promise<LLMProvider> {
  const credential = await loadToolProviderCredential(toolId, providerKey);
  if (!credential) return getLLMProvider(providerKey);
  return getLLMProvider(providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function getToolEmbeddingProvider(toolId: string): Promise<EmbeddingProvider> {
  const credential = await loadToolCredentialByKind(toolId, "embedding");
  if (!credential) return getEmbeddingProvider();
  return getEmbeddingProvider(credential.providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function getToolModerationProvider(toolId: string): Promise<ModerationProvider> {
  const credential = await loadToolCredentialByKind(toolId, "moderation");
  if (!credential) return getModerationProvider();
  return getModerationProvider(credential.providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function moderateForTool(toolId: string, text: string): Promise<ModerationResult> {
  const platformResult = await getModerationProvider().evaluate({ text });
  if (platformResult.flagged) return platformResult;
  const credential = await loadToolCredentialByKind(toolId, "moderation");
  if (!credential) return platformResult;
  const toolProvider = getModerationProvider(credential.providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
  return toolProvider.evaluate({ text });
}

export async function getToolSTTProvider(toolId: string): Promise<SpeechToTextProvider> {
  const credential = await loadToolCredentialByKind(toolId, "stt");
  if (!credential) return getSTTProvider();
  return getSTTProvider(credential.providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function getToolTTSProvider(toolId: string): Promise<TextToSpeechProvider> {
  const credential = await loadToolCredentialByKind(toolId, "tts");
  if (!credential) return getTTSProvider();
  return getTTSProvider(credential.providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function getToolVoiceAvailability(
  toolId: string,
): Promise<{ input: boolean; output: boolean }> {
  const [stt, tts] = await Promise.all([getToolSTTProvider(toolId), getToolTTSProvider(toolId)]);
  return {
    input: stt.key !== "disabled",
    output: tts.key !== "disabled",
  };
}

export async function testToolProviderCredential(toolId: string, providerId: string) {
  const rows = await db
    .select({
      credentialId: toolProviderCredentials.id,
      providerKey: providers.key,
      providerKind: providers.kind,
    })
    .from(toolProviderCredentials)
    .innerJoin(providers, eq(providers.id, toolProviderCredentials.providerId))
    .where(
      and(
        eq(toolProviderCredentials.toolId, toolId),
        eq(toolProviderCredentials.providerId, providerId),
      ),
    )
    .limit(1);
  const selected = rows[0];
  if (!selected) throw new NotFoundError("La herramienta no tiene una clave configurada para este proveedor.");

  const provider =
    selected.providerKind === "llm"
      ? await getToolLLMProvider(toolId, selected.providerKey)
      : selected.providerKind === "embedding"
        ? await getToolEmbeddingProvider(toolId)
        : selected.providerKind === "moderation"
          ? await getToolModerationProvider(toolId)
          : selected.providerKind === "stt"
            ? await getToolSTTProvider(toolId)
            : selected.providerKind === "tts"
              ? await getToolTTSProvider(toolId)
              : null;
  if (!provider) throw new ValidationError("Tipo de proveedor no compatible.");
  const health = await provider.healthcheck();
  await db
    .update(toolProviderCredentials)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: health.healthy ? "healthy" : "unhealthy",
      updatedAt: new Date(),
    })
    .where(eq(toolProviderCredentials.id, selected.credentialId));
  return health;
}

export async function toolHasProviderCredential(toolId: string, providerId: string): Promise<boolean> {
  const rows = await db
    .select({ id: toolProviderCredentials.id })
    .from(toolProviderCredentials)
    .where(
      and(
        eq(toolProviderCredentials.toolId, toolId),
        eq(toolProviderCredentials.providerId, providerId),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}
