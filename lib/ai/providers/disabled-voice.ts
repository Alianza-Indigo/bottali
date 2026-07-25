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

const NOT_CONFIGURED_HEALTH: ProviderHealth = {
  healthy: false,
  message: "Proveedor de voz no configurado.",
  checkedAt: new Date(0).toISOString(),
};

export class DisabledSpeechToTextProvider implements SpeechToTextProvider {
  readonly key = "disabled";

  async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
    void input;
    throw new Error("La transcripción de voz no está habilitada en esta instancia.");
  }

  async healthcheck(): Promise<ProviderHealth> {
    return NOT_CONFIGURED_HEALTH;
  }
}

export class DisabledTextToSpeechProvider implements TextToSpeechProvider {
  readonly key = "disabled";

  async listVoices(): Promise<Voice[]> {
    return [];
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    void input;
    throw new Error("La síntesis de voz no está habilitada en esta instancia.");
  }

  async healthcheck(): Promise<ProviderHealth> {
    return NOT_CONFIGURED_HEALTH;
  }
}
