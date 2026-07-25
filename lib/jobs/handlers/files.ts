import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { generatedFiles, uploadedFiles } from "@/db/schema";
import { registerJobHandler } from "../registry";

/**
 * §17/§36 cron cleanup: marks expired uploads/exports as deleted and removes the
 * underlying object via lib/storage's adapter (Vercel Blob in production, local disk in
 * dev/test) — provider-agnostic, dynamically imported so this module doesn't force a
 * storage dependency on every job-handler consumer.
 */
registerJobHandler("cleanup_expired_files", async () => {
  const now = new Date();

  const expiredUploads = await db
    .select({ id: uploadedFiles.id, blobKey: uploadedFiles.blobKey })
    .from(uploadedFiles)
    .where(and(lt(uploadedFiles.expiresAt, now), isNull(uploadedFiles.deletedAt)))
    .limit(200);

  const expiredGenerated = await db
    .select({ id: generatedFiles.id, blobKey: generatedFiles.blobKey })
    .from(generatedFiles)
    .where(and(lt(generatedFiles.expiresAt, now), isNull(generatedFiles.deletedAt)))
    .limit(200);

  let deletedBlobs = 0;
  if (expiredUploads.length > 0 || expiredGenerated.length > 0) {
    const { getStorageAdapter } = await import("@/lib/storage");
    const storage = getStorageAdapter();
    for (const file of [...expiredUploads, ...expiredGenerated]) {
      try {
        await storage.del(file.blobKey);
        deletedBlobs += 1;
      } catch {
        // Best-effort: the DB row is still marked deleted below even if the blob was
        // already gone or the provider call failed — a later manual sweep can reconcile.
      }
    }
  }

  for (const file of expiredUploads) {
    await db.update(uploadedFiles).set({ status: "DELETED", deletedAt: now }).where(eq(uploadedFiles.id, file.id));
  }
  for (const file of expiredGenerated) {
    await db.update(generatedFiles).set({ deletedAt: now }).where(eq(generatedFiles.id, file.id));
  }

  return { expiredUploads: expiredUploads.length, expiredGenerated: expiredGenerated.length, deletedBlobs };
});
