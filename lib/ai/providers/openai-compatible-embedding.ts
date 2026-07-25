import type { EmbeddingProvider, ProviderHealth } from "../types";

export interface OpenAICompatibleEmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly key = "openai-compatible";
  readonly dimensions: number;

  constructor(private readonly config: OpenAICompatibleEmbeddingConfig) {
    this.dimensions = config.dimensions;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: this.config.model, input: texts }),
      });
      if (!res.ok) throw new Error(`El proveedor de embeddings respondió con error (HTTP ${res.status}).`);
      const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return body.data.map((d) => d.embedding);
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthcheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      await this.embedTexts(["healthcheck"]);
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
