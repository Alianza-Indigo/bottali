import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { providerModels, providers } from "@/db/schema";
import { getEnv } from "@/lib/env";

interface ProviderSpec {
  kind: "llm" | "embedding" | "moderation" | "stt" | "tts";
  key: string;
  name: string;
  enabled: boolean;
  models: Array<{
    modelKey: string;
    displayName: string;
    contextWindow: number;
    inputCostPerMilleCents?: string;
    outputCostPerMilleCents?: string;
  }>;
}

/**
 * Idempotently reflects the *actually configured* providers (from environment variables)
 * into the `providers`/`provider_models` catalog tables. The admin UI and tool builder read
 * from this table, never from environment variables directly — this is what guarantees
 * "no muestres proveedores ni modelos que no estén realmente configurados" (spec §22).
 */
export async function syncProvidersFromEnv(db: Database): Promise<void> {
  const env = getEnv();

  const specs: ProviderSpec[] = [
    {
      kind: "llm",
      key: env.LLM_PROVIDER,
      name: env.LLM_PROVIDER === "fake" ? "Proveedor de pruebas (fake)" : "Proveedor LLM configurado",
      enabled: env.LLM_PROVIDER === "fake" || Boolean(env.LLM_API_KEY),
      models:
        env.LLM_PROVIDER === "fake"
          ? [{ modelKey: "fake-standard", displayName: "Fake Standard (pruebas)", contextWindow: 8000 }]
          : [{ modelKey: env.LLM_DEFAULT_MODEL, displayName: env.LLM_DEFAULT_MODEL, contextWindow: 128000 }].concat(
              env.LLM_FALLBACK_MODEL
                ? [{ modelKey: env.LLM_FALLBACK_MODEL, displayName: env.LLM_FALLBACK_MODEL, contextWindow: 128000 }]
                : [],
            ),
    },
    {
      kind: "llm",
      key: "gemini",
      name: "Google Gemini",
      enabled: Boolean(env.GEMINI_API_KEY),
      models: [
        {
          modelKey: "gemini-3.1-flash-lite",
          displayName: "Gemini 3.1 Flash-Lite",
          contextWindow: 1_048_576,
          inputCostPerMilleCents: "0.0250",
          outputCostPerMilleCents: "0.1500",
        },
      ],
    },
    ...(env.LLM_PROVIDER === "openai-compatible"
      ? []
      : [
          {
            kind: "llm" as const,
            key: "openai-compatible",
            name: "OpenAI compatible",
            enabled: false,
            models: [
              {
                modelKey: "gpt-4o-mini",
                displayName: "GPT-4o mini",
                contextWindow: 128_000,
              },
            ],
          },
        ]),
    {
      kind: "embedding",
      key: env.EMBEDDING_PROVIDER,
      name: env.EMBEDDING_PROVIDER === "fake" ? "Embeddings de pruebas (fake)" : "Proveedor de embeddings configurado",
      enabled: env.EMBEDDING_PROVIDER === "fake" || Boolean(env.EMBEDDING_API_KEY),
      models:
        env.EMBEDDING_PROVIDER === "fake"
          ? [{ modelKey: "fake-embedding", displayName: "Fake Embedding (pruebas)", contextWindow: 0 }]
          : [{ modelKey: env.EMBEDDING_MODEL, displayName: env.EMBEDDING_MODEL, contextWindow: 0 }],
    },
    ...(env.EMBEDDING_PROVIDER === "openai-compatible"
      ? []
      : [
          {
            kind: "embedding" as const,
            key: "openai-compatible",
            name: "Embeddings OpenAI compatible",
            enabled: false,
            models: [
              {
                modelKey: "text-embedding-3-small",
                displayName: "text-embedding-3-small",
                contextWindow: 0,
              },
            ],
          },
        ]),
    {
      kind: "moderation",
      key: env.MODERATION_PROVIDER,
      name: env.MODERATION_PROVIDER === "fake" ? "Moderación de pruebas (fake)" : "Proveedor de moderación configurado",
      enabled: env.MODERATION_PROVIDER === "fake" || Boolean(env.MODERATION_API_KEY),
      models: [],
    },
    ...(env.MODERATION_PROVIDER === "openai-compatible"
      ? []
      : [
          {
            kind: "moderation" as const,
            key: "openai-compatible",
            name: "Moderación OpenAI compatible",
            enabled: false,
            models: [],
          },
        ]),
    {
      kind: "stt",
      key: env.STT_PROVIDER,
      name: env.STT_PROVIDER === "fake" ? "Reconocimiento de voz (pruebas)" : "Reconocimiento de voz",
      enabled: env.STT_PROVIDER === "fake" || (env.STT_PROVIDER === "openai-compatible" && Boolean(env.STT_API_KEY)),
      models: [],
    },
    ...(env.STT_PROVIDER === "openai-compatible"
      ? []
      : [
          {
            kind: "stt" as const,
            key: "openai-compatible",
            name: "Voz a texto OpenAI compatible",
            enabled: false,
            models: [],
          },
        ]),
    {
      kind: "tts",
      key: env.TTS_PROVIDER,
      name: env.TTS_PROVIDER === "fake" ? "Síntesis de voz (pruebas)" : "Síntesis de voz",
      enabled: env.TTS_PROVIDER === "fake" || (env.TTS_PROVIDER === "openai-compatible" && Boolean(env.TTS_API_KEY)),
      models: [],
    },
    ...(env.TTS_PROVIDER === "openai-compatible"
      ? []
      : [
          {
            kind: "tts" as const,
            key: "openai-compatible",
            name: "Texto a voz OpenAI compatible",
            enabled: false,
            models: [],
          },
        ]),
  ];

  for (const spec of specs) {
    const registryKey = `${spec.kind}:${spec.key}`;
    const existing = await db.select({ id: providers.id }).from(providers).where(eq(providers.key, registryKey)).limit(1);

    const providerId =
      existing[0]?.id ??
      (
        await db
          .insert(providers)
          .values({ kind: spec.kind, key: registryKey, name: spec.name, enabled: spec.enabled })
          .returning({ id: providers.id })
      )[0]?.id;

    if (!providerId) continue;

    await db.update(providers).set({ enabled: spec.enabled, name: spec.name, updatedAt: new Date() }).where(eq(providers.id, providerId));

    for (const model of spec.models) {
      await db
        .insert(providerModels)
        .values({
          providerId,
          modelKey: model.modelKey,
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          inputCostPerMilleCents: model.inputCostPerMilleCents ?? "0",
          outputCostPerMilleCents: model.outputCostPerMilleCents ?? "0",
        })
        .onConflictDoUpdate({
          target: [providerModels.providerId, providerModels.modelKey],
          set: {
            displayName: model.displayName,
            contextWindow: model.contextWindow,
            inputCostPerMilleCents: model.inputCostPerMilleCents ?? "0",
            outputCostPerMilleCents: model.outputCostPerMilleCents ?? "0",
            available: true,
          },
        });
    }
  }
}
