import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { uploadedFiles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { completeUpload, deleteUploadedFile, getFileForDownload, initiateUpload } from "@/lib/files/service";
import { ForbiddenError, ValidationError } from "@/lib/utils/errors";

describe("file upload/download lifecycle (local-disk storage adapter)", () => {
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `files-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    userId = user!.id;

    const [other] = await db
      .insert(users)
      .values({ email: `files-other-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    otherUserId = other!.id;
  });

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (otherUserId) await db.delete(users).where(eq(users.id, otherUserId));
  });

  it("uploads, downloads, and deletes a file end-to-end", async () => {
    const content = Buffer.from("contenido de prueba para un archivo de texto plano.", "utf-8");
    const { fileId } = await initiateUpload({
      userId,
      originalName: "prueba.txt",
      mimeType: "text/plain",
      sizeBytes: content.length,
    });

    await completeUpload(fileId, userId, content);

    const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
    expect(rows[0]!.status).toBe("VALIDATED");
    expect(rows[0]!.checksum).toHaveLength(64);

    const downloaded = await getFileForDownload(fileId, userId);
    expect(downloaded.buffer.toString("utf-8")).toBe(content.toString("utf-8"));
    expect(downloaded.originalName).toBe("prueba.txt");

    await deleteUploadedFile(fileId, userId);
    const afterDelete = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
    expect(afterDelete[0]!.status).toBe("DELETED");
    expect(afterDelete[0]!.deletedAt).toBeTruthy();

    await expect(getFileForDownload(fileId, userId)).rejects.toThrow();
  });

  it("rejects a download attempt from a different user", async () => {
    const content = Buffer.from("contenido privado", "utf-8");
    const { fileId } = await initiateUpload({ userId, originalName: "privado.txt", mimeType: "text/plain", sizeBytes: content.length });
    await completeUpload(fileId, userId, content);

    await expect(getFileForDownload(fileId, otherUserId)).rejects.toThrow(ForbiddenError);

    await deleteUploadedFile(fileId, userId);
  });

  it("rejects a size mismatch between declared and actual bytes", async () => {
    const declaredSize = 100;
    const actualContent = Buffer.from("mucho más corto");
    const { fileId } = await initiateUpload({ userId, originalName: "mismatch.txt", mimeType: "text/plain", sizeBytes: declaredSize });

    await expect(completeUpload(fileId, userId, actualContent)).rejects.toThrow(ValidationError);

    const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
    expect(rows[0]!.status).toBe("REJECTED");
  });

  it("rejects an oversized upload request at initiation", async () => {
    await expect(
      initiateUpload({ userId, originalName: "huge.txt", mimeType: "text/plain", sizeBytes: 999_999_999 }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a disallowed MIME type at initiation", async () => {
    await expect(
      initiateUpload({ userId, originalName: "script.exe", mimeType: "application/x-msdownload", sizeBytes: 100 }),
    ).rejects.toThrow(ValidationError);
  });
});
