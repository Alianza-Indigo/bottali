import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getTTSProvider, isVoiceEnabled } from "@/lib/ai/registry";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ForbiddenError, RateLimitError } from "@/lib/utils/errors";

const schema = z.object({
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(80),
  speed: z.number().min(0.5).max(2).optional(),
});

/** §16: synthesizes speech for an assistant reply. The resulting audio is streamed straight
 * back in the response body — never written to disk/Blob/DB (no permanent audio storage). */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!isVoiceEnabled()) {
      throw new ForbiddenError("La salida de voz no está habilitada en esta instancia.");
    }

    const limiter = getRateLimiter();
    const rl = await limiter.consume(`speech-synthesize:${user.id}`, 30, 60 * 15);
    if (!rl.allowed) throw new RateLimitError();

    const body = await parseJsonBody(request, schema);
    const result = await getTTSProvider().synthesize(body);

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
