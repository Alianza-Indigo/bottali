export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface LLMModel {
  key: string;
  displayName: string;
  contextWindow: number;
  supportsStreaming: boolean;
}

export interface GenerationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerationRequest {
  model: string;
  messages: GenerationMessage[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  /** AbortSignal propagated from the HTTP request so client-disconnects cancel generation. */
  signal?: AbortSignal;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerationResult {
  content: string;
  finishReason: "stop" | "length" | "content_filter" | "error";
  usage: GenerationUsage;
  model: string;
  latencyMs: number;
}

export interface GenerationChunk {
  delta: string;
  done: boolean;
  finishReason?: GenerationResult["finishReason"];
  usage?: GenerationUsage;
}

export interface LLMProvider {
  readonly key: string;
  listModels(): Promise<LLMModel[]>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  stream(request: GenerationRequest): AsyncIterable<GenerationChunk>;
  healthcheck(): Promise<ProviderHealth>;
}

export interface EmbeddingProvider {
  readonly key: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
  healthcheck(): Promise<ProviderHealth>;
}

export interface SpeechToTextInput {
  audio: Blob;
  mimeType: string;
  language?: string;
}

export interface SpeechToTextResult {
  text: string;
  language?: string;
  durationMs?: number;
}

export interface SpeechToTextProvider {
  readonly key: string;
  transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult>;
  healthcheck(): Promise<ProviderHealth>;
}

export interface Voice {
  id: string;
  name: string;
  language: string;
}

export interface TextToSpeechInput {
  text: string;
  voiceId: string;
  speed?: number;
}

export interface TextToSpeechResult {
  audio: Buffer;
  mimeType: string;
}

export interface TextToSpeechProvider {
  readonly key: string;
  listVoices(): Promise<Voice[]>;
  synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult>;
  healthcheck(): Promise<ProviderHealth>;
}

export interface ModerationInput {
  text: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  reason?: string;
}

export interface ModerationProvider {
  readonly key: string;
  evaluate(input: ModerationInput): Promise<ModerationResult>;
  healthcheck(): Promise<ProviderHealth>;
}
