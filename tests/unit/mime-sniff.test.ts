import { describe, expect, it } from "vitest";
import { sniffMimeType } from "@/lib/files/validate";

describe("sniffMimeType", () => {
  it("detects PDF from magic bytes regardless of declared type", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("fake pdf body")]);
    expect(sniffMimeType(buffer, "application/octet-stream", "doc.pdf")).toBe("application/pdf");
  });

  it("detects PNG from magic bytes", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffMimeType(buffer, "image/png", "image.png")).toBe("image/png");
  });

  it("detects a docx (zip container) by extension when magic bytes match zip", () => {
    const buffer = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("rest of zip")]);
    expect(sniffMimeType(buffer, "application/octet-stream", "resume.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("accepts plain text content declared as text/plain", () => {
    const buffer = Buffer.from("Este es un documento de texto plano sin binarios.");
    expect(sniffMimeType(buffer, "text/plain", "notes.txt")).toBe("text/plain");
  });

  it("rejects content whose declared type is text/plain but whose bytes are binary", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x10]);
    expect(sniffMimeType(buffer, "text/plain", "notes.txt")).toBeNull();
  });

  it("rejects an executable disguised with a PDF extension but no valid signature", () => {
    const buffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00binary-exe-content");
    expect(sniffMimeType(buffer, "application/pdf", "document.pdf")).toBeNull();
  });

  it("detects WebM audio (MediaRecorder default) from its EBML magic bytes", () => {
    const buffer = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("rest of webm")]);
    expect(sniffMimeType(buffer, "application/octet-stream", "recording.webm")).toBe("audio/webm");
  });

  it("detects Ogg audio from its OggS magic bytes", () => {
    const buffer = Buffer.concat([Buffer.from([0x4f, 0x67, 0x67, 0x53]), Buffer.from("rest of ogg")]);
    expect(sniffMimeType(buffer, "application/octet-stream", "recording.ogg")).toBe("audio/ogg");
  });

  it("detects WAV audio from its RIFF/WAVE magic bytes", () => {
    const buffer = Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46]),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from([0x57, 0x41, 0x56, 0x45]),
      Buffer.from("fmt rest"),
    ]);
    expect(sniffMimeType(buffer, "application/octet-stream", "recording.wav")).toBe("audio/wav");
  });

  it("detects tagged MP3 audio from its ID3 magic bytes", () => {
    const buffer = Buffer.concat([Buffer.from([0x49, 0x44, 0x33]), Buffer.from("rest of mp3")]);
    expect(sniffMimeType(buffer, "application/octet-stream", "recording.mp3")).toBe("audio/mpeg");
  });
});
