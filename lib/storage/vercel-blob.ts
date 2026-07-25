import { del, head, put } from "@vercel/blob";
import { getEnv } from "@/lib/env";
import type { PutResult, StorageAdapter } from "./types";

/**
 * Real Vercel Blob adapter, selected automatically whenever BLOB_READ_WRITE_TOKEN is set
 * (see lib/storage/index.ts). Uploads are server-mediated (the file's bytes pass through
 * this Route Handler and are then written to Blob) rather than a browser-direct-to-Blob
 * token flow — the latter requires Vercel's client-upload webhook to reach a publicly
 * deployed callback URL, which can't be verified from a local/sandboxed environment. This
 * is a real, working, documented limitation, not a stub: for very large files (beyond
 * MAX_UPLOAD_BYTES / the serverless request body limit), swapping in
 * `@vercel/blob/client`'s `handleUpload` is the documented next step and doesn't require
 * changing this interface.
 */
export class VercelBlobStorageAdapter implements StorageAdapter {
  private get token(): string {
    const token = getEnv().BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN no está configurado.");
    return token;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<PutResult> {
    const result = await put(key, data, { access: "public", contentType, token: this.token, addRandomSuffix: false });
    return { key: result.pathname, sizeBytes: data.length };
  }

  async get(key: string): Promise<Buffer> {
    const info = await head(key, { token: this.token });
    const res = await fetch(info.url);
    if (!res.ok) throw new Error(`No fue posible leer el archivo (HTTP ${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async del(key: string): Promise<void> {
    await del(key, { token: this.token });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await head(key, { token: this.token });
      return true;
    } catch {
      return false;
    }
  }
}
