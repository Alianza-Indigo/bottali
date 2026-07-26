import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getSTTProvider, isVoiceEnabled } from "@/lib/ai/registry";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { sniffMimeType, ALLOWED_AUDIO_MIME_TYPES, MAX_AUDIO_UPLOAD_BYTES } from "@/lib/files/validate";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/utils/errors";

/**
 * §16/§17: audio is received, validated (real MIME via magic bytes, size), transcribed, and
 * discarded — never written to disk/Blob/DB. The client keeps the resulting text in the
 * composer for editing before it's actually sent as a message.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!isVoiceEnabled()) {
      throw new ForbiddenError("La entrada de voz no está habilitada en esta instancia.");
    }

    const limiter = getRateLimiter();
    const rl = await limiter.consume(`speech-transcribe:${user.id}`, 20, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new ValidationError("Falta el archivo de audio.");
    }
    if (audio.size > MAX_AUDIO_UPLOAD_BYTES) {
      throw new ValidationError(`El audio excede el tamaño máximo permitido (${MAX_AUDIO_UPLOAD_BYTES} bytes).`);
    }
    const language = form.get("language");

    const buffer = Buffer.from(await audio.arrayBuffer());
    const declaredType = audio instanceof File ? audio.type : "application/octet-stream";
    const sniffed = sniffMimeType(buffer, declaredType, "audio");
    if (!sniffed || !ALLOWED_AUDIO_MIME_TYPES.includes(sniffed)) {
      throw new ValidationError("El archivo no es un audio válido o su formato no está permitido.");
    }

    const result = await getSTTProvider().transcribe({
      audio,
      mimeType: sniffed,
      language: typeof language === "string" && language ? language : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
