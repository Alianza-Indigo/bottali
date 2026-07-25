import { randomBytes, createHash } from "node:crypto";

/** Opaque, high-entropy token for cookies/links. Only its SHA-256 hash is persisted. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
