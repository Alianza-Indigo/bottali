import type { ModerationInput, ModerationProvider, ModerationResult, ProviderHealth } from "../types";

// Small, explicit keyword list — enough to exercise the moderation code path deterministically
// in tests/dev without calling a real moderation API. Not a substitute for a real provider in production.
const FLAGGED_KEYWORDS = ["bomba", "suicidio", "arma de fuego", "explosivo", "matar a"];

export class FakeModerationProvider implements ModerationProvider {
  readonly key = "fake";

  async evaluate(input: ModerationInput): Promise<ModerationResult> {
    const lower = input.text.toLowerCase();
    const matched = FLAGGED_KEYWORDS.filter((keyword) => lower.includes(keyword));
    return {
      flagged: matched.length > 0,
      categories: matched,
      reason: matched.length > 0 ? `Contiene términos restringidos: ${matched.join(", ")}` : undefined,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}
