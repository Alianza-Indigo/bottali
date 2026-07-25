import { getInternalTool } from "./registry";
import type { ToolExecutionContext, ToolExecutionResult } from "./types";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/audit/log";
import { ForbiddenError, ValidationError } from "@/lib/utils/errors";

const EXECUTION_TIMEOUT_MS = 5000;
const RATE_LIMIT_PER_MINUTE = 20;

/**
 * Single choke point for running an internal tool (§15): allow-list lookup, input
 * validation, rate limiting, timeout, and audit logging. Nothing in this codebase should
 * call a ToolDefinition's `execute` directly — always through this function.
 */
export async function executeInternalTool(
  toolName: string,
  rawInput: unknown,
  context: ToolExecutionContext,
  allowedToolNames: string[],
): Promise<ToolExecutionResult> {
  if (!allowedToolNames.includes(toolName)) {
    throw new ForbiddenError(`La herramienta interna "${toolName}" no está permitida en esta conversación.`);
  }

  const definition = getInternalTool(toolName);
  if (!definition) throw new ValidationError(`Herramienta interna desconocida: ${toolName}`);

  const parsed = definition.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError("Entrada inválida para la herramienta interna.", parsed.error.flatten());
  }

  const rateLimit = await getRateLimiter().consume(`internal-tool:${context.userId}:${toolName}`, RATE_LIMIT_PER_MINUTE, 60);
  if (!rateLimit.allowed) {
    throw new ForbiddenError("Se alcanzó el límite de ejecuciones para esta herramienta interna.");
  }

  const timeoutPromise = new Promise<ToolExecutionResult>((_, reject) =>
    setTimeout(() => reject(new Error("La herramienta interna excedió el tiempo máximo de ejecución.")), EXECUTION_TIMEOUT_MS),
  );

  let result: ToolExecutionResult;
  try {
    result = await Promise.race([definition.execute(parsed.data, context), timeoutPromise]);
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }

  await recordAuditEvent({
    actorId: context.userId,
    action: "internal_tool.execute",
    resourceType: "internal_tool",
    resourceId: toolName,
    result: result.success ? "SUCCESS" : "FAILURE",
    metadata: { conversationId: context.conversationId, toolId: context.toolId },
  });

  return result;
}
