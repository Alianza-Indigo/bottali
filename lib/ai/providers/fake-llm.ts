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

/** Deterministic, network-free response derived from the conversation content — same input always
 * produces the same output, which is what makes this provider useful for tests and CI. */
function buildDeterministicReply(request: GenerationRequest): string {
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
    const content = buildDeterministicReply(request);
    const inputTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));
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
    const full = buildDeterministicReply(request);
    const words = full.split(" ");
    const inputTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));
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
