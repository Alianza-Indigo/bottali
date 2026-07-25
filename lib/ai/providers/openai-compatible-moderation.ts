import type { ModerationInput, ModerationProvider, ModerationResult, ProviderHealth } from "../types";

export interface OpenAICompatibleModerationConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export class OpenAICompatibleModerationProvider implements ModerationProvider {
  readonly key = "openai-compatible";

  constructor(private readonly config: OpenAICompatibleModerationConfig) {}

  async evaluate(input: ModerationInput): Promise<ModerationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/moderations`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: input.text }),
      });
      if (!res.ok) throw new Error(`El proveedor de moderación respondió con error (HTTP ${res.status}).`);
      const body = (await res.json()) as {
        results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
      };
      const result = body.results[0];
      const categories = Object.entries(result?.categories ?? {})
        .filter(([, value]) => value)
        .map(([key]) => key);
      return { flagged: result?.flagged ?? false, categories };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthcheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      await this.evaluate({ text: "healthcheck" });
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
