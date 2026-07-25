import { z } from "zod";
import type { ToolExecutionContext, ToolExecutionResult } from "./types";
import { evaluateArithmeticExpression } from "./calculator";

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  requiresConfirmation: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

const calculatorSchema = z.object({ expression: z.string().min(1).max(200) });
const dateTimeSchema = z.object({ timezone: z.string().max(64).optional() });
const documentSchema = z.object({ title: z.string().min(1).max(200), content: z.string().min(1).max(20000) });

// The registry map necessarily erases each tool's concrete input type (they differ per
// tool) — this single narrow cast is the one place that happens. Every call site still
// goes through executeInternalTool, which re-validates the raw input against
// `inputSchema` before ever calling `execute`, so nothing unvalidated reaches it.
function eraseInputType<T>(definition: ToolDefinition<T>): ToolDefinition<unknown> {
  return definition as ToolDefinition<unknown>;
}

/** §15 demo internal tools — safe, sandboxed, no filesystem/network/secret access. These
 * are the ONLY internal tools registered; execution always goes through executeInternalTool,
 * which enforces the allow-list, permission check, rate limit, timeout, and audit log. */
export const INTERNAL_TOOLS: Record<string, ToolDefinition<unknown>> = {
  calculator: eraseInputType({
    name: "calculator",
    description: "Evalúa una expresión aritmética simple (+, -, *, /, paréntesis).",
    inputSchema: calculatorSchema,
    requiresConfirmation: false,
    riskLevel: "LOW",
    async execute(input: z.infer<typeof calculatorSchema>): Promise<ToolExecutionResult> {
      const result = evaluateArithmeticExpression(input.expression);
      return { success: true, output: { result } };
    },
  }),
  datetime: eraseInputType({
    name: "datetime",
    description: "Devuelve la fecha y hora actual, opcionalmente en una zona horaria.",
    inputSchema: dateTimeSchema,
    requiresConfirmation: false,
    riskLevel: "LOW",
    async execute(input: z.infer<typeof dateTimeSchema>): Promise<ToolExecutionResult> {
      const formatter = new Intl.DateTimeFormat("es", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: input.timezone || "UTC",
      });
      return { success: true, output: { now: formatter.format(new Date()) } };
    },
  }),
  generate_text_document: eraseInputType({
    name: "generate_text_document",
    description: "Genera un documento de texto plano a partir de un título y contenido.",
    inputSchema: documentSchema,
    requiresConfirmation: false,
    riskLevel: "LOW",
    async execute(input: z.infer<typeof documentSchema>): Promise<ToolExecutionResult> {
      const text = `${input.title}\n${"=".repeat(input.title.length)}\n\n${input.content}`;
      return { success: true, output: { text, mimeType: "text/plain" } };
    },
  }),
};

export function getInternalTool(name: string): ToolDefinition | undefined {
  return INTERNAL_TOOLS[name];
}

export function listInternalTools(): Array<Pick<ToolDefinition, "name" | "description" | "riskLevel" | "requiresConfirmation">> {
  return Object.values(INTERNAL_TOOLS).map(({ name, description, riskLevel, requiresConfirmation }) => ({
    name,
    description,
    riskLevel,
    requiresConfirmation,
  }));
}
