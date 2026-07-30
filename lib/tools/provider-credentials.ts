import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providers, toolProviderCredentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { getLLMProvider } from "@/lib/ai/registry";
import type { LLMProvider } from "@/lib/ai/types";
import { getToolById } from "./repository";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export const TOOL_CREDENTIAL_PROVIDER_KEYS = ["llm:gemini", "llm:openai-compatible"] as const;

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
  if (!provider || provider.kind !== "llm") throw new NotFoundError("Proveedor LLM no encontrado.");
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
        provider.key === "llm:openai-compatible"
          ? input.baseUrl?.replace(/\/+$/, "") ?? null
          : null,
    })
    .onConflictDoUpdate({
      target: [toolProviderCredentials.toolId, toolProviderCredentials.providerId],
      set: {
        apiKeyEncrypted: encrypted,
        ...(hint ? { keyHint: hint } : {}),
        baseUrl:
          provider.key === "llm:openai-compatible"
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

export async function getToolLLMProvider(toolId: string, providerKey: string): Promise<LLMProvider> {
  const credential = await loadToolProviderCredential(toolId, providerKey);
  if (!credential) return getLLMProvider(providerKey);
  return getLLMProvider(providerKey, {
    apiKey: decryptSecret(credential.apiKeyEncrypted),
    baseUrl: credential.baseUrl,
  });
}

export async function testToolProviderCredential(toolId: string, providerId: string) {
  const rows = await db
    .select({
      credentialId: toolProviderCredentials.id,
      providerKey: providers.key,
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

  const health = await (await getToolLLMProvider(toolId, selected.providerKey)).healthcheck();
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
