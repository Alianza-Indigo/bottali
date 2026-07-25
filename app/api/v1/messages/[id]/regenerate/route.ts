import { requireCurrentUser } from "@/lib/auth/current-user";
import { regenerateResponse } from "@/lib/conversations/pipeline";
import { handleApiError } from "@/lib/validation/http";

const encoder = new TextEncoder();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of regenerateResponse({ assistantMessageId: id, userId: user.id, signal: request.signal })) {
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
