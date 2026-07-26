// Real (magic-byte) MIME sniffing — never trust a client-supplied Content-Type header
// (§17: "validar MIME real"). Deliberately hand-rolled instead of an extra dependency:
// the set of formats this platform accepts (§14) is small and fixed.

export interface SniffResult {
  mimeType: string;
  extensionOk: boolean;
}

const SIGNATURES: Array<{ mimeType: string; magic: number[]; offset?: number }> = [
  { mimeType: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mimeType: "application/zip", magic: [0x50, 0x4b, 0x03, 0x04] }, // also matches .docx (zip container)
  { mimeType: "audio/webm", magic: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML container (WebM/MediaRecorder default)
  { mimeType: "audio/ogg", magic: [0x4f, 0x67, 0x67, 0x53] }, // "OggS"
  { mimeType: "audio/mpeg", magic: [0x49, 0x44, 0x33] }, // "ID3" tag (tagged MP3)
];

function matchesSignature(buffer: Buffer, magic: number[], offset = 0): boolean {
  if (buffer.length < offset + magic.length) return false;
  return magic.every((byte, index) => buffer[offset + index] === byte);
}

const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WAVE = [0x57, 0x41, 0x56, 0x45]; // "WAVE"

function isWav(buffer: Buffer): boolean {
  return matchesSignature(buffer, RIFF, 0) && matchesSignature(buffer, WAVE, 8);
}

function looksLikePlainText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  let controlChars = 0;
  for (const byte of sample) {
    if (byte === 0) return false; // NUL byte — definitely not text
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controlChars += 1;
  }
  return controlChars / Math.max(1, sample.length) < 0.01;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Sniffs the real file type from content bytes. Returns null if the content doesn't match
 * any allowed signature at all (caller should reject). */
export function sniffMimeType(buffer: Buffer, declaredMimeType: string, originalName: string): string | null {
  if (isWav(buffer)) return "audio/wav";
  for (const sig of SIGNATURES) {
    if (matchesSignature(buffer, sig.magic, sig.offset)) {
      if (sig.mimeType === "application/zip" && originalName.toLowerCase().endsWith(".docx")) {
        return DOCX_MIME;
      }
      return sig.mimeType;
    }
  }
  if (
    (declaredMimeType === "text/plain" || declaredMimeType === "text/markdown" || declaredMimeType === "text/html") &&
    looksLikePlainText(buffer)
  ) {
    return declaredMimeType;
  }
  return null;
}

export const ALLOWED_KNOWLEDGE_MIME_TYPES = ["application/pdf", DOCX_MIME, "text/plain", "text/markdown", "text/html"];
export const ALLOWED_UPLOAD_MIME_TYPES = [...ALLOWED_KNOWLEDGE_MIME_TYPES, "image/png", "image/jpeg"];
export const ALLOWED_AUDIO_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"];
export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — a few minutes of compressed speech audio
