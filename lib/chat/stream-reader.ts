export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; finishReason: string }
  | { type: "blocked"; reason: string }
  | { type: "error"; message: string };

/** Parses the newline-delimited JSON stream produced by the messages/regenerate route
 * handlers, yielding one parsed event per complete line as soon as it arrives. */
export async function* readNdjsonStream(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) throw new Error("La respuesta no contiene datos de transmisión.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line) as ChatStreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatStreamEvent;
}
