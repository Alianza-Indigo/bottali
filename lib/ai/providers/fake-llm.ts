import { createHash } from "node:crypto";
import type {
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  LLMModel,
  LLMProvider,
  ProviderHealth,
} from "../types";

const FAKE_MODELS: LLMModel[] = [
  { key: "fake-standard", displayName: "Fake Standard (pruebas)", contextWindow: 8000, supportsStreaming: true },
];

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Deterministic tool-call trigger for tests/demos: a user message of the exact form
 * `HERRAMIENTA:<tool_name> <json_args>` (case-insensitive prefix) asks the fake model to
 * call that tool with those arguments — e.g. `HERRAMIENTA:calculator {"expression":"6*7"}`.
 * Without a real model to decide when to call a tool, this is what makes the tool-calling
 * loop in lib/conversations/pipeline.ts exercisable deterministically, no network involved.
 */
const TOOL_TRIGGER_PATTERN = /^herramienta:(\S+)\s+(\{.*\})$/is;

function detectRequestedToolCall(request: GenerationRequest): { name: string; argumentsJson: string } | null {
  if (!request.tools?.length) return null;
  const lastMessage = request.messages[request.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") return null;
  const match = lastMessage.content.trim().match(TOOL_TRIGGER_PATTERN);
  if (!match) return null;
  const [, toolName, argumentsJson] = match;
  if (!request.tools.some((tool) => tool.name === toolName)) return null;
  return { name: toolName!, argumentsJson: argumentsJson! };
}

/** Deterministic, network-free response derived from the conversation content — same input always
 * produces the same output, which is what makes this provider useful for tests and CI. */
function buildDeterministicReply(request: GenerationRequest): string {
  const lastMessage = request.messages[request.messages.length - 1];
  if (lastMessage?.role === "tool") {
    return (
      `[respuesta generada por el proveedor de pruebas fake-standard tras usar una herramienta interna]\n` +
      `Resultado de la herramienta: ${lastMessage.content.slice(0, 500)}`
    );
  }
  const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
  const seed = createHash("sha256")
    .update(request.messages.map((m) => `${m.role}:${m.content}`).join("\n"))
    .digest("hex")
    .slice(0, 8);
  const userText = lastUser?.content?.trim() || "(sin mensaje)";
  return (
    `[respuesta generada por el proveedor de pruebas fake-standard, semilla ${seed}]\n` +
    `Recibí tu mensaje: "${userText.slice(0, 280)}". ` +
    `Esta es una respuesta simulada y determinista, útil para pruebas automatizadas y para desarrollo sin costo de API.`
  );
}

export class FakeLLMProvider implements LLMProvider {
  readonly key = "fake";

  async listModels(): Promise<LLMModel[]> {
    return FAKE_MODELS;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const started = Date.now();
    if (request.signal?.aborted) {
      return { content: "", finishReason: "error", usage: { inputTokens: 0, outputTokens: 0 }, model: request.model, latencyMs: 0 };
    }
    const inputTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));

    const requestedCall = detectRequestedToolCall(request);
    if (requestedCall) {
      const toolCalls = [{ id: `fake-call-${estimateTokens(requestedCall.argumentsJson)}`, name: requestedCall.name, arguments: requestedCall.argumentsJson }];
      return {
        content: "",
        finishReason: "tool_calls",
        usage: { inputTokens, outputTokens: 0 },
        model: request.model,
        latencyMs: Date.now() - started,
        toolCalls,
      };
    }

    const content = buildDeterministicReply(request);
    const outputTokens = estimateTokens(content);
    return {
      content,
      finishReason: "stop",
      usage: { inputTokens, outputTokens },
      model: request.model,
      latencyMs: Date.now() - started,
    };
  }

  async *stream(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const inputTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));

    const requestedCall = detectRequestedToolCall(request);
    if (requestedCall) {
      const toolCalls = [{ id: `fake-call-${estimateTokens(requestedCall.argumentsJson)}`, name: requestedCall.name, arguments: requestedCall.argumentsJson }];
      yield { delta: "", done: true, finishReason: "tool_calls", usage: { inputTokens, outputTokens: 0 }, toolCalls };
      return;
    }

    const full = buildDeterministicReply(request);
    const words = full.split(" ");
    let emitted = "";
    for (const word of words) {
      if (request.signal?.aborted) {
        yield { delta: "", done: true, finishReason: "error" };
        return;
      }
      const chunkText = (emitted ? " " : "") + word;
      emitted += chunkText;
      yield { delta: chunkText, done: false };
    }
    yield {
      delta: "",
      done: true,
      finishReason: "stop",
      usage: { inputTokens, outputTokens: estimateTokens(emitted) },
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}
