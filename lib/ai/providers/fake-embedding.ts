import { createHash } from "node:crypto";
import type { EmbeddingProvider, ProviderHealth } from "../types";

const DIMENSIONS = 1536;

/** Deterministic pseudo-embedding derived from a SHA-256 hash of the text, expanded to
 * DIMENSIONS floats in [-1, 1]. Not semantically meaningful, but stable and network-free —
 * enough to exercise chunking/storage/retrieval code paths in tests and local development. */
function embedOne(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  const vector = new Array<number>(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    const byte = digest[i % digest.length] ?? 0;
    vector[i] = (byte / 255) * 2 - 1;
  }
  return vector;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly key = "fake";
  readonly dimensions = DIMENSIONS;

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map(embedOne);
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}
