import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getToolSTTProvider, getToolVoiceAvailability } from "@/lib/tools/provider-credentials";
import { requireToolRuntimeCapability } from "@/lib/tools/runtime-access";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { sniffMimeType, ALLOWED_AUDIO_MIME_TYPES, MAX_AUDIO_UPLOAD_BYTES } from "@/lib/files/validate";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/utils/errors";

/**
 * Audio is validated, transcribed, and discarded. It is never written to storage.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const limiter = getRateLimiter();
    const rl = await limiter.consume(`speech-transcribe:${user.id}`, 20, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const form = await request.formData();
    const parsedToolId = z.string().uuid().safeParse(form.get("toolId"));
    if (!parsedToolId.success) throw new ValidationError("Falta una herramienta válida.");
    const toolId = parsedToolId.data;
    await requireToolRuntimeCapability(toolId, user.id, "voiceInput");
    const availability = await getToolVoiceAvailability(toolId);
    if (!availability.input) {
      throw new ForbiddenError("La entrada de voz no tiene un proveedor configurado.");
    }

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

    const provider = await getToolSTTProvider(toolId);
    const result = await provider.transcribe({
      audio,
      mimeType: sniffed,
      language: typeof language === "string" && language ? language : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
