import { requireCurrentUser } from "@/lib/auth/current-user";
import { resumeAfterToolConfirmation } from "@/lib/conversations/pipeline";
import { handleApiError } from "@/lib/validation/http";

const encoder = new TextEncoder();

/** §15 human-in-the-loop: rejects a paused tool call. The model is told the user declined
 * (not silently dropped) and the round loop continues, so it can adapt or just answer
 * without the tool instead of the turn dying with no explanation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; confirmationId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { confirmationId } = await params;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of resumeAfterToolConfirmation({
            confirmationId,
            userId: user.id,
            organizationId: user.organizationId,
            decision: "reject",
            signal: request.signal,
          })) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error inesperado.";
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
