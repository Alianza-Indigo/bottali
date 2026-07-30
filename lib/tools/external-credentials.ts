import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolCapabilities, toolExternalCredentials, toolVersions } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { assertSafeExternalUrl } from "@/lib/security/external-url";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";
import { getToolById } from "./repository";

export type ExternalAuthType = "bearer" | "api_key" | "basic" | "oauth2_client_credentials";

export interface ExternalCredentialInput {
  name: string;
  authType: ExternalAuthType;
  secret?: string;
  headerName?: string;
  username?: string;
  clientId?: string;
  tokenUrl?: string;
  scope?: string;
}

function secretHint(secret: string): string {
  return `****${secret.slice(-4)}`;
}

function publicConfig(input: ExternalCredentialInput) {
  if (input.authType === "api_key") {
    return { headerName: input.headerName || "X-API-Key" };
  }
  if (input.authType === "basic") {
    return { username: input.username };
  }
  if (input.authType === "oauth2_client_credentials") {
    return {
      clientId: input.clientId,
      tokenUrl: input.tokenUrl?.replace(/\/+$/, ""),
      scope: input.scope || undefined,
    };
  }
  return {};
}

function validateCredential(input: ExternalCredentialInput, hasExistingSecret: boolean) {
  if (!hasExistingSecret && !input.secret) throw new ValidationError("Ingresa el secreto de la credencial.");
  if (input.authType === "basic" && !input.username) {
    throw new ValidationError("Basic Auth requiere un usuario.");
  }
  if (input.authType === "oauth2_client_credentials") {
    if (!input.clientId || !input.tokenUrl) {
      throw new ValidationError("OAuth2 requiere client ID y URL de token.");
    }
  }
}

export async function listToolExternalCredentials(toolId: string) {
  await getToolById(toolId);
  return db
    .select({
      id: toolExternalCredentials.id,
      name: toolExternalCredentials.name,
      authType: toolExternalCredentials.authType,
      keyHint: toolExternalCredentials.keyHint,
      config: toolExternalCredentials.config,
      updatedAt: toolExternalCredentials.updatedAt,
    })
    .from(toolExternalCredentials)
    .where(eq(toolExternalCredentials.toolId, toolId));
}

export async function listToolExternalCredentialOptions(toolId: string) {
  await getToolById(toolId);
  return db
    .select({
      id: toolExternalCredentials.id,
      name: toolExternalCredentials.name,
      authType: toolExternalCredentials.authType,
    })
    .from(toolExternalCredentials)
    .where(eq(toolExternalCredentials.toolId, toolId));
}

export async function assertToolExternalCredentialReferences(
  toolId: string,
  credentialIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(credentialIds)];
  if (uniqueIds.length === 0) return;
  const rows = await db
    .select({ id: toolExternalCredentials.id })
    .from(toolExternalCredentials)
    .where(
      and(
        eq(toolExternalCredentials.toolId, toolId),
        inArray(toolExternalCredentials.id, uniqueIds),
      ),
    );
  const validIds = new Set(rows.map((row) => row.id));
  if (uniqueIds.some((credentialId) => !validIds.has(credentialId))) {
    throw new ValidationError(
      "Un endpoint externo referencia una credencial inexistente o de otra herramienta.",
    );
  }
}

export async function saveToolExternalCredential(input: {
  toolId: string;
  credentialId?: string;
  credential: ExternalCredentialInput;
  actorId: string;
}) {
  await getToolById(input.toolId);
  const existing = input.credentialId
    ? (
        await db
          .select()
          .from(toolExternalCredentials)
          .where(
            and(
              eq(toolExternalCredentials.id, input.credentialId),
              eq(toolExternalCredentials.toolId, input.toolId),
            ),
          )
          .limit(1)
      )[0]
    : null;
  if (input.credentialId && !existing) throw new NotFoundError("Credencial externa no encontrada.");
  validateCredential(input.credential, Boolean(existing));

  const sameName = await db
    .select({ id: toolExternalCredentials.id })
    .from(toolExternalCredentials)
    .where(
      and(
        eq(toolExternalCredentials.toolId, input.toolId),
        eq(toolExternalCredentials.name, input.credential.name),
      ),
    )
    .limit(1);
  if (sameName[0] && sameName[0].id !== existing?.id) {
    throw new ConflictError("Ya existe una credencial externa con ese nombre.");
  }

  if (
    input.credential.authType === "oauth2_client_credentials" &&
    input.credential.tokenUrl
  ) {
    await assertSafeExternalUrl(input.credential.tokenUrl);
  }

  const encrypted = input.credential.secret
    ? encryptSecret(input.credential.secret)
    : existing!.secretEncrypted;
  const hint = input.credential.secret
    ? secretHint(input.credential.secret)
    : existing!.keyHint;
  const values = {
    name: input.credential.name,
    authType: input.credential.authType,
    secretEncrypted: encrypted,
    keyHint: hint,
    config: publicConfig(input.credential),
    updatedBy: input.actorId,
    updatedAt: new Date(),
  };

  const credentialId = existing
    ? (
        await db
          .update(toolExternalCredentials)
          .set(values)
          .where(eq(toolExternalCredentials.id, existing.id))
          .returning({ id: toolExternalCredentials.id })
      )[0]?.id
    : (
        await db
          .insert(toolExternalCredentials)
          .values({
            ...values,
            toolId: input.toolId,
            createdBy: input.actorId,
          })
          .returning({ id: toolExternalCredentials.id })
      )[0]?.id;
  if (!credentialId) throw new Error("No fue posible guardar la credencial externa.");

  await recordAuditEvent({
    actorId: input.actorId,
    action: existing ? "tool.external_credential.update" : "tool.external_credential.create",
    resourceType: "tool",
    resourceId: input.toolId,
    metadata: { credentialId, authType: input.credential.authType },
  });
  return credentialId;
}

export async function deleteToolExternalCredential(input: {
  toolId: string;
  credentialId: string;
  actorId: string;
}) {
  const capabilityRows = await db
    .select({ endpoints: toolCapabilities.externalApiEndpoints })
    .from(toolCapabilities)
    .innerJoin(toolVersions, eq(toolVersions.id, toolCapabilities.toolVersionId))
    .where(eq(toolVersions.toolId, input.toolId));
  if (
    capabilityRows.some((row) =>
      row.endpoints.some((endpoint) => endpoint.credentialId === input.credentialId),
    )
  ) {
    throw new ConflictError("La credencial está vinculada a un endpoint. Desvincúlala antes de eliminarla.");
  }

  const deleted = await db
    .delete(toolExternalCredentials)
    .where(
      and(
        eq(toolExternalCredentials.id, input.credentialId),
        eq(toolExternalCredentials.toolId, input.toolId),
      ),
    )
    .returning({ id: toolExternalCredentials.id });
  if (!deleted[0]) throw new NotFoundError("Credencial externa no encontrada.");
  await recordAuditEvent({
    actorId: input.actorId,
    action: "tool.external_credential.delete",
    resourceType: "tool",
    resourceId: input.toolId,
    metadata: { credentialId: input.credentialId },
  });
}

async function oauthAccessToken(config: {
  clientId?: string;
  tokenUrl?: string;
  scope?: string;
}, clientSecret: string): Promise<string> {
  if (!config.clientId || !config.tokenUrl) throw new Error("La credencial OAuth2 está incompleta.");
  const tokenUrl = await assertSafeExternalUrl(config.tokenUrl);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: clientSecret,
  });
  if (config.scope) body.set("scope", config.scope);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`El proveedor OAuth2 respondió ${response.status}.`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("El proveedor OAuth2 no devolvió access_token.");
  return payload.access_token;
}

export async function resolveExternalCredentialHeaders(
  toolId: string,
  credentialId?: string,
): Promise<Record<string, string>> {
  if (!credentialId) return {};
  const credential = (
    await db
      .select()
      .from(toolExternalCredentials)
      .where(
        and(
          eq(toolExternalCredentials.id, credentialId),
          eq(toolExternalCredentials.toolId, toolId),
        ),
      )
      .limit(1)
  )[0];
  if (!credential) throw new Error("La credencial externa vinculada no existe.");

  const secret = decryptSecret(credential.secretEncrypted);
  const config = credential.config;
  switch (credential.authType as ExternalAuthType) {
    case "bearer":
      return { Authorization: `Bearer ${secret}` };
    case "api_key":
      return { [config.headerName || "X-API-Key"]: secret };
    case "basic":
      return {
        Authorization: `Basic ${Buffer.from(`${config.username || ""}:${secret}`).toString("base64")}`,
      };
    case "oauth2_client_credentials":
      return { Authorization: `Bearer ${await oauthAccessToken(config, secret)}` };
    default:
      throw new Error("Tipo de autenticación externa no compatible.");
  }
}
