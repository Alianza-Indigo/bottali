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

const FAKE_VOICES: Voice[] = [
  { id: "fake-a", name: "Voz de prueba A", language: "es" },
  { id: "fake-b", name: "Voz de prueba B", language: "es" },
];

/** Deterministic, network-free STT — same style as FakeLLMProvider/FakeModerationProvider:
 * lets voice input be developed/tested/demoed without a real transcription API. Audio content
 * isn't actually parsed (there's nothing meaningful to derive without a real model); the
 * response is a fixed, clearly-labeled placeholder. */
export class FakeSpeechToTextProvider implements SpeechToTextProvider {
  readonly key = "fake";

  async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
    return {
      text: "[transcripción simulada del proveedor de pruebas fake — audio recibido correctamente]",
      language: input.language ?? "es",
      durationMs: 0,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}

/** Builds a minimal, valid, silent PCM WAV file — real audio bytes a browser can actually
 * decode and play, not a fake string standing in for a file. */
function buildSilentWav(durationSeconds = 0.3): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.round(sampleRate * durationSeconds);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  // Remaining bytes are already zero-initialized (silence).

  return buffer;
}

export class FakeTextToSpeechProvider implements TextToSpeechProvider {
  readonly key = "fake";

  async listVoices(): Promise<Voice[]> {
    return FAKE_VOICES;
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    // Duration scales (loosely) with text length so longer replies produce longer clips,
    // without needing any real speech synthesis.
    const seconds = Math.min(5, Math.max(0.3, input.text.length / 40));
    return { audio: buildSilentWav(seconds), mimeType: "audio/wav" };
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
}
