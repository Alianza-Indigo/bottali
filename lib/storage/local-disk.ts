import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { StorageAdapter } from "./types";

const ROOT = resolve(process.cwd(), ".local-blob");

function safePath(key: string): string {
  // Reject path traversal outright — key is always a UUID-derived path we generate
  // ourselves, never a user-supplied filename, but this stays defense-in-depth.
  if (key.includes("..") || key.startsWith("/") || key.startsWith(sep)) {
    throw new Error(`Clave de almacenamiento inválida: ${key}`);
  }
  return join(ROOT, key);
}

/**
 * Local-filesystem stand-in for Vercel Blob, used only in development/tests when
 * BLOB_READ_WRITE_TOKEN is not configured (§39: local conveniences are fine; the
 * production path never depends on this — see lib/storage/index.ts). Never selected
 * when APP_ENV=production.
 */
export class LocalDiskStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer): Promise<{ key: string; sizeBytes: number }> {
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, sizeBytes: data.length };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(safePath(key));
  }

  async del(key: string): Promise<void> {
    await rm(safePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(safePath(key));
      return true;
    } catch {
      return false;
    }
  }
}
