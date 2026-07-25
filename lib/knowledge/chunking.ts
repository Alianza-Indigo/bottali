export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

/** Fixed-size sliding-window chunking with overlap — simple, deterministic, and adequate
 * for the embedding-based retrieval in lib/knowledge/retrieval.ts. Splits on paragraph
 * boundaries where possible so a chunk isn't cut mid-sentence more than necessary. */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1200;
  const overlapChars = options.overlapChars ?? 150;
  if (text.length <= maxChars) return text.trim() ? [text.trim()] : [];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > maxChars && current) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlapChars));
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(maxChars - overlapChars);
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((chunk) => chunk.length > 0);
}
