import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { sendMessage } from "@/lib/conversations/pipeline";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({
  content: z.string().min(1).max(8000),
  attachedFileIds: z.array(z.string().uuid()).max(5).optional(),
});

const encoder = new TextEncoder();

/**
 * Streaming HTTP response: newline-delimited JSON events (§11/§12/§27). Using a plain
 * fetch-readable stream rather than SSE/EventSource so the client can POST with cookies
 * and a body, and so cancellation is a first-class `AbortController` on the client that
 * this route's `request.signal` observes directly (closing the tab or calling
 * controller.abort() propagates to the LLM provider mid-generation).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  let content: string;
  let attachedFileIds: string[] | undefined;
  try {
    user = await requireCurrentUser();
    const { id } = await params;
    ({ content, attachedFileIds } = await parseJsonBody(request, schema));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of sendMessage({ conversationId: id, userId: user!.id, content, attachedFileIds, signal: request.signal })) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error inesperado.";
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
        } finally {
          controller.close();
        }
      },
      cancel() {
        // The client aborted the fetch; request.signal firing is what actually stops
        // the LLM provider stream inside sendMessage — nothing further needed here.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
