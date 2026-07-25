import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/knowledge/chunking";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hola mundo.", { maxChars: 1200 });
    expect(chunks).toEqual(["Hola mundo."]);
  });

  it("returns no chunks for empty text", () => {
    expect(chunkText("", { maxChars: 1200 })).toEqual([]);
    expect(chunkText("   ", { maxChars: 1200 })).toEqual([]);
  });

  it("splits long text into multiple chunks respecting maxChars", () => {
    const paragraph = "Lorem ipsum dolor sit amet. ".repeat(20); // ~560 chars
    const longText = Array.from({ length: 10 }, () => paragraph).join("\n\n");
    const chunks = chunkText(longText, { maxChars: 500, overlapChars: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500 + 50); // allow small overlap slack
    }
  });

  it("produces overlapping content between consecutive chunks", () => {
    const text = Array.from({ length: 100 }, (_, i) => `palabra${i}`).join(" ");
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);

    const tailOfFirst = chunks[0]!.slice(-30);
    const lastWordOfTail = tailOfFirst.trim().split(" ").pop()!;
    expect(chunks[1]!.startsWith(lastWordOfTail) || chunks[1]!.includes(lastWordOfTail)).toBe(true);
  });
});
