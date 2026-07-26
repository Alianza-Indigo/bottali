import { requireCurrentUser } from "@/lib/auth/current-user";
import { resumeAfterToolConfirmation } from "@/lib/conversations/pipeline";
import { handleApiError } from "@/lib/validation/http";

const encoder = new TextEncoder();

/** §15 human-in-the-loop: approves a paused tool call and resumes generation. Streams
 * NDJSON exactly like /messages and /regenerate — the client keeps consuming the same
 * stream-reading code for all three. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; confirmationId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { confirmationId } = await params;

    // Optional body: only present when approving a collect_form_input confirmation (§
    // capacidad forms) — the normal approve/reject flow sends no body at all, so this must
    // tolerate an empty request rather than requiring valid JSON.
    let formAnswers: Record<string, string> | undefined;
    const rawBody = await request.text();
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && typeof parsed === "object" && parsed.formAnswers && typeof parsed.formAnswers === "object") {
          formAnswers = parsed.formAnswers;
        }
      } catch {
        // Malformed body — proceed as if none was sent.
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of resumeAfterToolConfirmation({
            confirmationId,
            userId: user.id,
            decision: "approve",
            formAnswers,
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
