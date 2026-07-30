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

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string | null;
}

export function getLLMProvider(providerKey?: string, credentials?: ProviderCredentials): LLMProvider {
  const env = getEnv();
  const defaultProviderKey = `llm:${env.LLM_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultProviderKey;
  const cached = credentials ? undefined : llmProviders.get(resolvedKey);
  if (cached) return cached;

  let provider: LLMProvider;
  if (resolvedKey === "llm:gemini") {
    const apiKey = credentials?.apiKey ?? env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini requiere una clave API en la herramienta o GEMINI_API_KEY.");
    provider = new OpenAICompatibleLLMProvider({
      apiKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      timeoutMs: 30000,
      maxRetries: 2,
      providerKey: "gemini",
    });
  } else if (resolvedKey === "llm:openai-compatible") {
    const apiKey = credentials?.apiKey ?? (env.LLM_PROVIDER === "openai-compatible" ? env.LLM_API_KEY : undefined);
    const baseUrl = credentials?.baseUrl ?? env.LLM_API_BASE_URL;
    if (!apiKey) throw new Error("El proveedor OpenAI-compatible requiere una clave API en la herramienta o LLM_API_KEY.");
    provider = new OpenAICompatibleLLMProvider({
      apiKey,
      baseUrl,
      timeoutMs: 30000,
      maxRetries: 2,
      providerKey: "openai-compatible",
    });
  } else if (resolvedKey === defaultProviderKey && env.LLM_PROVIDER === "fake") {
    provider = new FakeLLMProvider();
  } else {
    throw new Error(`Proveedor LLM no configurado: ${resolvedKey}.`);
  }

  if (!credentials) llmProviders.set(resolvedKey, provider);
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

export function getEmbeddingProvider(
  providerKey?: string,
  credentials?: ProviderCredentials,
): EmbeddingProvider {
  const env = getEnv();
  const defaultKey = `embedding:${env.EMBEDDING_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultKey;
  if (!credentials && embeddingProvider && resolvedKey === defaultKey) return embeddingProvider;
  let provider: EmbeddingProvider;
  if (resolvedKey === "embedding:openai-compatible") {
    const apiKey =
      credentials?.apiKey ??
      (env.EMBEDDING_PROVIDER === "openai-compatible" ? env.EMBEDDING_API_KEY : undefined);
    if (!apiKey) throw new Error("Embeddings requieren una clave API en la herramienta o EMBEDDING_API_KEY.");
    provider = new OpenAICompatibleEmbeddingProvider({
      apiKey,
      baseUrl: credentials?.baseUrl ?? env.EMBEDDING_API_BASE_URL,
      model: env.EMBEDDING_MODEL,
      dimensions: 1536,
      timeoutMs: 20000,
    });
  } else if (resolvedKey === defaultKey && env.EMBEDDING_PROVIDER === "fake") {
    provider = new FakeEmbeddingProvider();
  } else {
    throw new Error(`Proveedor de embeddings no configurado: ${resolvedKey}.`);
  }
  if (!credentials && resolvedKey === defaultKey) embeddingProvider = provider;
  return provider;
}

export function getModerationProvider(
  providerKey?: string,
  credentials?: ProviderCredentials,
): ModerationProvider {
  const env = getEnv();
  const defaultKey = `moderation:${env.MODERATION_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultKey;
  if (!credentials && moderationProvider && resolvedKey === defaultKey) return moderationProvider;
  let provider: ModerationProvider;
  if (resolvedKey === "moderation:openai-compatible") {
    const apiKey =
      credentials?.apiKey ??
      (env.MODERATION_PROVIDER === "openai-compatible" ? env.MODERATION_API_KEY : undefined);
    if (!apiKey) throw new Error("Moderación requiere una clave API en la herramienta o MODERATION_API_KEY.");
    provider = new OpenAICompatibleModerationProvider({
      apiKey,
      baseUrl: credentials?.baseUrl ?? env.LLM_API_BASE_URL,
      timeoutMs: 10000,
    });
  } else if (resolvedKey === defaultKey && env.MODERATION_PROVIDER === "fake") {
    provider = new FakeModerationProvider();
  } else {
    throw new Error(`Proveedor de moderación no configurado: ${resolvedKey}.`);
  }
  if (!credentials && resolvedKey === defaultKey) moderationProvider = provider;
  return provider;
}

export function getSTTProvider(
  providerKey?: string,
  credentials?: ProviderCredentials,
): SpeechToTextProvider {
  const env = getEnv();
  const defaultKey = `stt:${env.STT_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultKey;
  if (!credentials && sttProvider && resolvedKey === defaultKey) return sttProvider;
  let provider: SpeechToTextProvider;
  if (resolvedKey === "stt:openai-compatible") {
    const apiKey =
      credentials?.apiKey ??
      (env.STT_PROVIDER === "openai-compatible" ? env.STT_API_KEY : undefined);
    if (!apiKey) return new DisabledSpeechToTextProvider();
    provider = new OpenAICompatibleSpeechToTextProvider({
      apiKey,
      baseUrl: credentials?.baseUrl ?? env.LLM_API_BASE_URL,
      timeoutMs: 30000,
    });
  } else if (resolvedKey === defaultKey && env.STT_PROVIDER === "fake") {
    provider = new FakeSpeechToTextProvider();
  } else {
    provider = new DisabledSpeechToTextProvider();
  }
  if (!credentials && resolvedKey === defaultKey) sttProvider = provider;
  return provider;
}

export function getTTSProvider(
  providerKey?: string,
  credentials?: ProviderCredentials,
): TextToSpeechProvider {
  const env = getEnv();
  const defaultKey = `tts:${env.TTS_PROVIDER}`;
  const resolvedKey = providerKey ?? defaultKey;
  if (!credentials && ttsProvider && resolvedKey === defaultKey) return ttsProvider;
  let provider: TextToSpeechProvider;
  if (resolvedKey === "tts:openai-compatible") {
    const apiKey =
      credentials?.apiKey ??
      (env.TTS_PROVIDER === "openai-compatible" ? env.TTS_API_KEY : undefined);
    if (!apiKey) return new DisabledTextToSpeechProvider();
    provider = new OpenAICompatibleTextToSpeechProvider({
      apiKey,
      baseUrl: credentials?.baseUrl ?? env.LLM_API_BASE_URL,
      timeoutMs: 30000,
    });
  } else if (resolvedKey === defaultKey && env.TTS_PROVIDER === "fake") {
    provider = new FakeTextToSpeechProvider();
  } else {
    provider = new DisabledTextToSpeechProvider();
  }
  if (!credentials && resolvedKey === defaultKey) ttsProvider = provider;
  return provider;
}
