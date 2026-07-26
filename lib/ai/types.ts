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

/** One function/tool call the model asked to run — OpenAI-style: id links it to the
 * eventual "tool" role result message, arguments is a raw JSON string (may be malformed,
 * since it comes straight from the model and must be validated/parsed by the caller). */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface GenerationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on an "assistant" message that requested one or more tool calls. */
  toolCalls?: ToolCall[];
  /** Present on a "tool" role message: which call this is the result of. */
  toolCallId?: string;
}

/** A tool the model is allowed to call this turn, described as an OpenAI-style function
 * spec (name/description/JSON-schema parameters) — provider-agnostic on purpose so any
 * LLMProvider implementation can translate it into its own wire format. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GenerationRequest {
  model: string;
  messages: GenerationMessage[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  /** Tools the model may call this turn. Omitted entirely (not an empty array) when the
   * calling tool version has internal tools disabled, so providers that don't support
   * tool calling at all can just ignore the field unconditionally. */
  tools?: ToolSpec[];
  /** AbortSignal propagated from the HTTP request so client-disconnects cancel generation. */
  signal?: AbortSignal;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerationResult {
  content: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "error";
  usage: GenerationUsage;
  model: string;
  latencyMs: number;
  /** Present when finishReason === "tool_calls". */
  toolCalls?: ToolCall[];
}

export interface GenerationChunk {
  delta: string;
  done: boolean;
  finishReason?: GenerationResult["finishReason"];
  usage?: GenerationUsage;
  /** Present on the final chunk when finishReason === "tool_calls". */
  toolCalls?: ToolCall[];
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
