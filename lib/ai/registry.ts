import "server-only";
import { getEnv } from "@/lib/env";
import type { EmbeddingProvider, LLMProvider, ModerationProvider, SpeechToTextProvider, TextToSpeechProvider } from "./types";
import { FakeLLMProvider } from "./providers/fake-llm";
import { OpenAICompatibleLLMProvider } from "./providers/openai-compatible-llm";
import { FakeEmbeddingProvider } from "./providers/fake-embedding";
import { OpenAICompatibleEmbeddingProvider } from "./providers/openai-compatible-embedding";
import { FakeModerationProvider } from "./providers/fake-moderation";
import { OpenAICompatibleModerationProvider } from "./providers/openai-compatible-moderation";
import { DisabledSpeechToTextProvider, DisabledTextToSpeechProvider } from "./providers/disabled-voice";
import { OpenAICompatibleSpeechToTextProvider, OpenAICompatibleTextToSpeechProvider } from "./providers/openai-compatible-voice";
import { FakeSpeechToTextProvider, FakeTextToSpeechProvider } from "./providers/fake-voice";

const llmProviders = new Map<string, LLMProvider>();
let llmFallbackProvider: LLMProvider | undefined;
let embeddingProvider: EmbeddingProvider | undefined;
let moderationProvider: ModerationProvider | undefined;
let sttProvider: SpeechToTextProvider | undefined;
let ttsProvider: TextToSpeechProvider | undefined;

export function getLLMProvider(providerKey?: string): LLMProvider {
  const env = getEnv();
  const defaultProviderKey = `llm:${env.LLM_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultProviderKey;
  const cached = llmProviders.get(resolvedKey);
  if (cached) return cached;

  let provider: LLMProvider;
  if (resolvedKey === "llm:gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("Gemini requiere GEMINI_API_KEY.");
    provider = new OpenAICompatibleLLMProvider({
      apiKey: env.GEMINI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      timeoutMs: 30000,
      maxRetries: 2,
      providerKey: "gemini",
    });
  } else if (resolvedKey === defaultProviderKey && env.LLM_PROVIDER === "openai-compatible") {
    if (!env.LLM_API_KEY) throw new Error("LLM_PROVIDER=openai-compatible requiere LLM_API_KEY.");
    provider = new OpenAICompatibleLLMProvider({
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_API_BASE_URL,
      timeoutMs: 30000,
      maxRetries: 2,
      providerKey: env.LLM_PROVIDER,
    });
  } else if (resolvedKey === defaultProviderKey && env.LLM_PROVIDER === "fake") {
    provider = new FakeLLMProvider();
  } else {
    throw new Error(`Proveedor LLM no configurado: ${resolvedKey}.`);
  }

  llmProviders.set(resolvedKey, provider);
  return provider;
}

/** Returns a fallback LLM provider only when explicitly configured — never silently substitutes one. */
export function getFallbackLLMProvider(): LLMProvider | null {
  if (llmFallbackProvider) return llmFallbackProvider;
  const env = getEnv();
  if (!env.LLM_FALLBACK_MODEL) return null;
  // The fallback reuses the same provider transport (same LLM_PROVIDER kind) with a different model key;
  // model selection happens in the caller by passing LLM_FALLBACK_MODEL as GenerationRequest.model.
  llmFallbackProvider = getLLMProvider();
  return llmFallbackProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  const env = getEnv();
  if (env.EMBEDDING_PROVIDER === "openai-compatible") {
    if (!env.EMBEDDING_API_KEY) throw new Error("EMBEDDING_PROVIDER=openai-compatible requiere EMBEDDING_API_KEY.");
    embeddingProvider = new OpenAICompatibleEmbeddingProvider({
      apiKey: env.EMBEDDING_API_KEY,
      baseUrl: env.EMBEDDING_API_BASE_URL,
      model: env.EMBEDDING_MODEL,
      dimensions: 1536,
      timeoutMs: 20000,
    });
  } else {
    embeddingProvider = new FakeEmbeddingProvider();
  }
  return embeddingProvider;
}

export function getModerationProvider(): ModerationProvider {
  if (moderationProvider) return moderationProvider;
  const env = getEnv();
  if (env.MODERATION_PROVIDER === "openai-compatible") {
    if (!env.MODERATION_API_KEY) throw new Error("MODERATION_PROVIDER=openai-compatible requiere MODERATION_API_KEY.");
    moderationProvider = new OpenAICompatibleModerationProvider({
      apiKey: env.MODERATION_API_KEY,
      baseUrl: env.LLM_API_BASE_URL,
      timeoutMs: 10000,
    });
  } else {
    moderationProvider = new FakeModerationProvider();
  }
  return moderationProvider;
}

export function getSTTProvider(): SpeechToTextProvider {
  if (sttProvider) return sttProvider;
  const env = getEnv();
  if (env.STT_PROVIDER === "openai-compatible" && env.STT_API_KEY) {
    sttProvider = new OpenAICompatibleSpeechToTextProvider({
      apiKey: env.STT_API_KEY,
      baseUrl: env.LLM_API_BASE_URL,
      timeoutMs: 30000,
    });
  } else if (env.STT_PROVIDER === "fake") {
    sttProvider = new FakeSpeechToTextProvider();
  } else {
    sttProvider = new DisabledSpeechToTextProvider();
  }
  return sttProvider;
}

export function getTTSProvider(): TextToSpeechProvider {
  if (ttsProvider) return ttsProvider;
  const env = getEnv();
  if (env.TTS_PROVIDER === "openai-compatible" && env.TTS_API_KEY) {
    ttsProvider = new OpenAICompatibleTextToSpeechProvider({
      apiKey: env.TTS_API_KEY,
      baseUrl: env.LLM_API_BASE_URL,
      timeoutMs: 30000,
    });
  } else if (env.TTS_PROVIDER === "fake") {
    ttsProvider = new FakeTextToSpeechProvider();
  } else {
    ttsProvider = new DisabledTextToSpeechProvider();
  }
  return ttsProvider;
}

export function isVoiceEnabled(): boolean {
  const env = getEnv();
  return env.ENABLE_VOICE && getSTTProvider().key !== "disabled" && getTTSProvider().key !== "disabled";
}
