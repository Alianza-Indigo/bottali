import { z } from "zod";
import type { ToolSpec } from "@/lib/ai/types";
import type { ToolExecutionResult } from "./types";
import { assertSafeExternalUrl } from "@/lib/security/external-url";
import { recordAuditEvent, recordSecurityEvent } from "@/lib/audit/log";
import { getRateLimiter } from "@/lib/security/rate-limit";

export interface ExternalApiEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST";
  description?: string;
}

export interface ExternalApiExecutionContext {
  userId: string;
  conversationId: string;
  toolId: string;
}

export const EXTERNAL_API_TOOL_PREFIX = "external_api__";
const requestInputSchema = z.object({ body: z.record(z.unknown()).optional() });
const EXTERNAL_API_TIMEOUT_MS = 8000;
const MAX_EXTERNAL_RESPONSE_BYTES = 100_000;
const MAX_REDIRECTS = 3;

export function isExternalApiToolName(name: string): boolean {
  return name.startsWith(EXTERNAL_API_TOOL_PREFIX);
}

export function endpointNameFromToolName(toolName: string): string {
  return toolName.slice(EXTERNAL_API_TOOL_PREFIX.length);
}

export function buildExternalApiToolSpecs(endpoints: ExternalApiEndpoint[]): ToolSpec[] {
  return endpoints.map((endpoint) => ({
    name: `${EXTERNAL_API_TOOL_PREFIX}${endpoint.name}`,
    description: endpoint.description || `Llama a la API externa configurada "${endpoint.name}".`,
    parameters: {
      type: "object",
      properties: { body: { type: "object", description: "Cuerpo JSON opcional para la solicitud." } },
      required: [],
    },
  }));
}

async function auditExternalResult(
  endpointName: string,
  context: ExternalApiExecutionContext | undefined,
  result: ToolExecutionResult,
  metadata: Record<string, unknown> = {},
) {
  if (!context) return;
  await recordAuditEvent({
    actorId: context.userId,
    action: "external_api.execute",
    resourceType: "external_api",
    resourceId: endpointName,
    result: result.success ? "SUCCESS" : "FAILURE",
    reason: result.success ? undefined : result.error,
    metadata: { toolId: context.toolId, conversationId: context.conversationId, ...metadata },
  });
}

async function fetchWithSafeRedirects(endpoint: ExternalApiEndpoint, init: RequestInit) {
  let target = await assertSafeExternalUrl(endpoint.url);
  const originalHostname = target.hostname;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(target, init);
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, hostname: originalHostname };
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) throw new Error("La API externa excedió el límite de redirecciones.");
    const redirected = await assertSafeExternalUrl(new URL(location, target).toString());
    if (redirected.hostname !== originalHostname) throw new Error("La API externa intentó redirigir a otro dominio.");
    if (endpoint.method !== "GET") throw new Error("No se permiten redirecciones en llamadas POST.");
    target = redirected;
  }
  throw new Error("La API externa excedió el límite de redirecciones.");
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_EXTERNAL_RESPONSE_BYTES) throw new Error("La respuesta de la API externa excede el tamaño permitido.");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_EXTERNAL_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("La respuesta de la API externa excede el tamaño permitido.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function executeExternalApiCall(
  toolName: string,
  rawInput: unknown,
  endpoints: ExternalApiEndpoint[],
  context?: ExternalApiExecutionContext,
): Promise<ToolExecutionResult> {
  const endpointName = endpointNameFromToolName(toolName);
  const endpoint = endpoints.find((item) => item.name === endpointName);
  if (!endpoint) {
    const result = { success: false, error: `API externa desconocida: ${endpointName}` } satisfies ToolExecutionResult;
    await auditExternalResult(endpointName, context, result);
    return result;
  }
  const parsed = requestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const result = { success: false, error: "Los argumentos enviados no son válidos." } satisfies ToolExecutionResult;
    await auditExternalResult(endpointName, context, result);
    return result;
  }

  const startedAt = Date.now();
  let status: number | undefined;
  let hostname: string | undefined;
  let result: ToolExecutionResult;
  try {
    if (context) {
      const rateLimit = await getRateLimiter().consume(`external-api:${context.userId}:${endpointName}`, 30, 60);
      if (!rateLimit.allowed) throw new Error("Límite de llamadas a esta API externa excedido.");
    }
    const init: RequestInit = {
      method: endpoint.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
      redirect: "manual",
    };
    if (endpoint.method === "POST" && parsed.data.body) init.body = JSON.stringify(parsed.data.body);

    const fetched = await fetchWithSafeRedirects(endpoint, init);
    status = fetched.response.status;
    hostname = fetched.hostname;
    const text = await readLimitedBody(fetched.response);
    if (!fetched.response.ok) {
      result = { success: false, error: `La API externa respondió ${fetched.response.status}.` };
    } else {
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Plain text is supported.
      }
      result = { success: true, output: { status: fetched.response.status, body } };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "La llamada a la API externa falló.";
    result = { success: false, error: message };
    if (context && /privada|reservada|local|redirigir|redirecciones/i.test(message)) {
      await recordSecurityEvent({
        kind: "external_api_target_blocked",
        severity: "WARNING",
        userId: context.userId,
        details: { toolId: context.toolId, endpointName },
      });
    }
  }

  await auditExternalResult(endpointName, context, result, { hostname, status, durationMs: Date.now() - startedAt });
  return result;
}
