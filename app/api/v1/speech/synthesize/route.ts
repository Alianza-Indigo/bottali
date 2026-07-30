import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getToolTTSProvider, getToolVoiceAvailability } from "@/lib/tools/provider-credentials";
import { requireToolRuntimeCapability } from "@/lib/tools/runtime-access";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ForbiddenError, RateLimitError } from "@/lib/utils/errors";

const schema = z.object({
  toolId: z.string().uuid(),
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(80),
  speed: z.number().min(0.5).max(2).optional(),
});

/** Synthesizes audio in memory and returns it without permanent storage. */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const limiter = getRateLimiter();
    const rl = await limiter.consume(`speech-synthesize:${user.id}`, 30, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const body = await parseJsonBody(request, schema);
    await requireToolRuntimeCapability(body.toolId, user.id, "voiceOutput");
    const availability = await getToolVoiceAvailability(body.toolId);
    if (!availability.output) {
      throw new ForbiddenError("La salida de voz no tiene un proveedor configurado.");
    }

    const provider = await getToolTTSProvider(body.toolId);
    const result = await provider.synthesize({
      text: body.text,
      voiceId: body.voiceId,
      speed: body.speed,
    });

    return new Response(new Uint8Array(result.audio), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.audio.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
