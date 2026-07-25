import type {
  GenerationChunk,
  GenerationRequest,
  GenerationResult,
  LLMModel,
  LLMProvider,
  ProviderHealth,
} from "../types";

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  return a;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Talks to any Chat Completions-compatible HTTP API (OpenAI and drop-in compatible services). */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly key = "openai-compatible";

  constructor(private readonly config: OpenAICompatibleConfig) {}

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async listModels(): Promise<LLMModel[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`No fue posible listar modelos (HTTP ${res.status}).`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => ({
        key: m.id,
        displayName: m.id,
        contextWindow: 0,
        supportsStreaming: true,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const started = Date.now();
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.config.maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.authHeaders(),
          signal: combineSignals(request.signal, controller.signal),
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            top_p: request.topP,
            max_tokens: request.maxOutputTokens,
            stream: false,
          }),
        });

        if (!res.ok) {
          if (isRetryableStatus(res.status) && attempt < this.config.maxRetries) {
            attempt += 1;
            await sleep(2 ** attempt * 200);
            continue;
          }
          throw new Error(`El proveedor de IA respondió con error (HTTP ${res.status}).`);
        }

        const body = (await res.json()) as {
          choices: Array<{ message: { content: string }; finish_reason: string }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const choice = body.choices[0];
        return {
          content: choice?.message.content ?? "",
          finishReason: (choice?.finish_reason as GenerationResult["finishReason"]) ?? "stop",
          usage: {
            inputTokens: body.usage?.prompt_tokens ?? 0,
            outputTokens: body.usage?.completion_tokens ?? 0,
          },
          model: request.model,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        lastError = error;
        if (request.signal?.aborted) {
          return {
            content: "",
            finishReason: "error",
            usage: { inputTokens: 0, outputTokens: 0 },
            model: request.model,
            latencyMs: Date.now() - started,
          };
        }
        attempt += 1;
        if (attempt > this.config.maxRetries) break;
        await sleep(2 ** attempt * 200);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Fallo al generar respuesta del proveedor de IA.");
  }

  async *stream(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.authHeaders(),
        signal: combineSignals(request.signal, controller.signal),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          top_p: request.topP,
          max_tokens: request.maxOutputTokens,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`El proveedor de IA respondió con error (HTTP ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finishReason: GenerationChunk["finishReason"] = "stop";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const delta = parsed.choices[0]?.delta?.content ?? "";
            if (parsed.choices[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason as GenerationChunk["finishReason"];
            }
            if (delta) yield { delta, done: false };
          } catch {
            // Ignore malformed SSE fragments (keep-alive comments, partial JSON already buffered).
          }
        }
      }
      yield { delta: "", done: true, finishReason };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthcheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      await this.listModels();
      return { healthy: true, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : "Error desconocido",
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
