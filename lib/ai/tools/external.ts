import { z } from "zod";
import type { ToolSpec } from "@/lib/ai/types";
import type { ToolExecutionResult } from "./types";

export interface ExternalApiEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST";
  description?: string;
}

export const EXTERNAL_API_TOOL_PREFIX = "external_api__";

const requestInputSchema = z.object({ body: z.record(z.unknown()).optional() });

const EXTERNAL_API_TIMEOUT_MS = 8000;
const MAX_EXTERNAL_RESPONSE_BYTES = 100_000;

export function isExternalApiToolName(name: string): boolean {
  return name.startsWith(EXTERNAL_API_TOOL_PREFIX);
}

export function endpointNameFromToolName(toolName: string): string {
  return toolName.slice(EXTERNAL_API_TOOL_PREFIX.length);
}

/** Builds one ToolSpec per admin-configured endpoint (§ capacidad externalApis) — the model
 * only ever sees a fixed, named action with an optional JSON body; it can never supply or
 * influence the destination URL. */
export function buildExternalApiToolSpecs(endpoints: ExternalApiEndpoint[]): ToolSpec[] {
  return endpoints.map((endpoint) => ({
    name: `${EXTERNAL_API_TOOL_PREFIX}${endpoint.name}`,
    description: endpoint.description || `Llama a la API externa configurada "${endpoint.name}".`,
    parameters: {
      type: "object",
      properties: {
        body: { type: "object", description: "Cuerpo JSON opcional para la solicitud." },
      },
      required: [],
    },
  }));
}

/**
 * Executes one admin-configured external API call. Never throws — a network failure, a
 * non-2xx response, or bad input all become a `{success:false, error}` result the model can
 * see and recover from, same contract as executeInternalTool.
 */
export async function executeExternalApiCall(toolName: string, rawInput: unknown, endpoints: ExternalApiEndpoint[]): Promise<ToolExecutionResult> {
  const endpointName = endpointNameFromToolName(toolName);
  const endpoint = endpoints.find((e) => e.name === endpointName);
  if (!endpoint) return { success: false, error: `API externa desconocida: ${endpointName}` };

  const parsed = requestInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: "Los argumentos enviados no son válidos." };

  try {
    const init: RequestInit = {
      method: endpoint.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
    };
    if (endpoint.method === "POST" && parsed.data.body) {
      init.body = JSON.stringify(parsed.data.body);
    }
    const response = await fetch(endpoint.url, init);
    const reader = response.body?.getReader();
    let text = "";
    if (reader) {
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_EXTERNAL_RESPONSE_BYTES) {
          await reader.cancel();
          text += "... [respuesta truncada]";
          break;
        }
        text += Buffer.from(value).toString("utf-8");
      }
    }
    if (!response.ok) {
      return { success: false, error: `La API externa respondió ${response.status}: ${text.slice(0, 500)}` };
    }
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON — return as raw text, still a valid result.
    }
    return { success: true, output: { status: response.status, body } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "La llamada a la API externa falló." };
  }
}
