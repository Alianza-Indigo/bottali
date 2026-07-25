import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, uploadedFiles } from "@/db/schema";
import { getStorageAdapter } from "@/lib/storage";
import { getEnv } from "@/lib/env";
import { ALLOWED_UPLOAD_MIME_TYPES, sniffMimeType } from "./validate";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

function sanitizeBlobKey(userId: string, fileId: string, originalName: string): string {
  // Never derive the storage key from the user-supplied filename (path traversal,
  // collisions, unsafe characters) — only from server-generated UUIDs (§17).
  const extMatch = /\.[a-zA-Z0-9]{1,10}$/.exec(originalName);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";
  return `uploads/${userId}/${fileId}${ext}`;
}

export interface InitiateUploadInput {
  userId: string;
  toolId?: string;
  conversationId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function initiateUpload(input: InitiateUploadInput): Promise<{ fileId: string }> {
  const env = getEnv();
  if (!env.ENABLE_FILES) throw new ForbiddenError("La carga de archivos no está habilitada en esta instancia.");
  if (input.sizeBytes <= 0 || input.sizeBytes > env.MAX_UPLOAD_BYTES) {
    throw new ValidationError(`El archivo debe pesar entre 1 byte y ${env.MAX_UPLOAD_BYTES} bytes.`);
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(input.mimeType)) {
    throw new ValidationError(`Tipo de archivo no permitido: ${input.mimeType}`);
  }
  if (input.conversationId) {
    const rows = await db.select({ userId: conversations.userId }).from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
    if (!rows[0] || rows[0].userId !== input.userId) throw new ForbiddenError("No puedes adjuntar archivos a esta conversación.");
  }

  const [file] = await db
    .insert(uploadedFiles)
    .values({
      userId: input.userId,
      toolId: input.toolId,
      conversationId: input.conversationId,
      originalName: input.originalName.slice(0, 255),
      blobKey: "",
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: "",
      status: "PENDING",
    })
    .returning({ id: uploadedFiles.id });
  if (!file) throw new Error("No fue posible iniciar la carga.");

  return { fileId: file.id };
}

export async function completeUpload(fileId: string, userId: string, bytes: Buffer): Promise<void> {
  const env = getEnv();
  const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
  const file = rows[0];
  if (!file) throw new NotFoundError("Carga no encontrada.");
  if (file.userId !== userId) throw new ForbiddenError("No puedes completar esta carga.");
  if (file.status !== "PENDING") throw new ValidationError("Esta carga ya fue procesada.");

  if (bytes.length !== file.sizeBytes) {
    await db.update(uploadedFiles).set({ status: "REJECTED" }).where(eq(uploadedFiles.id, fileId));
    throw new ValidationError("El tamaño real del archivo no coincide con el declarado.");
  }
  if (bytes.length > env.MAX_UPLOAD_BYTES) {
    await db.update(uploadedFiles).set({ status: "REJECTED" }).where(eq(uploadedFiles.id, fileId));
    throw new ValidationError("El archivo excede el tamaño máximo permitido.");
  }

  const sniffed = sniffMimeType(bytes, file.mimeType, file.originalName);
  if (!sniffed) {
    await db.update(uploadedFiles).set({ status: "REJECTED" }).where(eq(uploadedFiles.id, fileId));
    throw new ValidationError("El contenido del archivo no corresponde a un tipo permitido.");
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const blobKey = sanitizeBlobKey(userId, fileId, file.originalName);

  await getStorageAdapter().put(blobKey, bytes, sniffed);

  await db
    .update(uploadedFiles)
    .set({ status: "VALIDATED", blobKey, mimeType: sniffed, checksum, sizeBytes: bytes.length })
    .where(eq(uploadedFiles.id, fileId));

  await recordAuditEvent({ actorId: userId, action: "file.upload_complete", resourceType: "uploaded_file", resourceId: fileId });
}

export async function getFileForDownload(fileId: string, userId: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
  const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
  const file = rows[0];
  if (!file || file.deletedAt || file.status !== "VALIDATED") throw new NotFoundError("Archivo no encontrado.");
  if (file.userId !== userId) throw new ForbiddenError("No puedes descargar este archivo.");

  const buffer = await getStorageAdapter().get(file.blobKey);
  await recordAuditEvent({ actorId: userId, action: "file.download", resourceType: "uploaded_file", resourceId: fileId });
  return { buffer, mimeType: file.mimeType, originalName: file.originalName };
}

export async function deleteUploadedFile(fileId: string, userId: string): Promise<void> {
  const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
  const file = rows[0];
  if (!file) throw new NotFoundError("Archivo no encontrado.");
  if (file.userId !== userId) throw new ForbiddenError("No puedes eliminar este archivo.");

  if (file.blobKey) {
    await getStorageAdapter()
      .del(file.blobKey)
      .catch(() => undefined);
  }
  await db.update(uploadedFiles).set({ status: "DELETED", deletedAt: new Date() }).where(eq(uploadedFiles.id, fileId));
  await recordAuditEvent({ actorId: userId, action: "file.delete", resourceType: "uploaded_file", resourceId: fileId });
}
