import type {
  ProviderHealth,
  SpeechToTextInput,
  SpeechToTextProvider,
  SpeechToTextResult,
  TextToSpeechInput,
  TextToSpeechProvider,
  TextToSpeechResult,
  Voice,
} from "../types";

export interface VoiceProviderConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

const STATIC_VOICES: Voice[] = [
  { id: "alloy", name: "Alloy", language: "es" },
  { id: "verse", name: "Verse", language: "es" },
];

export class OpenAICompatibleSpeechToTextProvider implements SpeechToTextProvider {
  readonly key = "openai-compatible";

  constructor(private readonly config: VoiceProviderConfig) {}

  async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const form = new FormData();
      form.append("file", input.audio, "audio");
      form.append("model", "whisper-1");
      if (input.language) form.append("language", input.language);

      const res = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`El proveedor de transcripción respondió con error (HTTP ${res.status}).`);
      const body = (await res.json()) as { text: string };
      return { text: body.text, language: input.language };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: Boolean(this.config.apiKey), checkedAt: new Date().toISOString() };
  }
}

export class OpenAICompatibleTextToSpeechProvider implements TextToSpeechProvider {
  readonly key = "openai-compatible";

  constructor(private readonly config: VoiceProviderConfig) {}

  async listVoices(): Promise<Voice[]> {
    return STATIC_VOICES;
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/audio/speech`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "tts-1", voice: input.voiceId, input: input.text, speed: input.speed ?? 1 }),
      });
      if (!res.ok) throw new Error(`El proveedor de síntesis respondió con error (HTTP ${res.status}).`);
      const arrayBuffer = await res.arrayBuffer();
      return { audio: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: Boolean(this.config.apiKey), checkedAt: new Date().toISOString() };
  }
}
