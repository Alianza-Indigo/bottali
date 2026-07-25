import "server-only";
import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";
import { LocalDiskStorageAdapter } from "./local-disk";
import { VercelBlobStorageAdapter } from "./vercel-blob";

export type { StorageAdapter, PutResult } from "./types";

let cached: StorageAdapter | undefined;

export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  const env = getEnv();
  if (env.BLOB_READ_WRITE_TOKEN) {
    cached = new VercelBlobStorageAdapter();
  } else {
    if (env.APP_ENV === "production") {
      throw new Error("BLOB_READ_WRITE_TOKEN es obligatorio en producción; no se usará almacenamiento local.");
    }
    cached = new LocalDiskStorageAdapter();
  }
  return cached;
}
