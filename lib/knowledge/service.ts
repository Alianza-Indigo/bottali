import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeChunks, knowledgeDocuments, knowledgeDocumentVersions } from "@/db/schema";
import { getStorageAdapter } from "@/lib/storage";
import { getEnv } from "@/lib/env";
import { ALLOWED_KNOWLEDGE_MIME_TYPES, sniffMimeType } from "@/lib/files/validate";
import { assertValidDocumentTransition, type KnowledgeDocumentStatus } from "./state-machine";
import { getJobProvider } from "@/lib/jobs";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export async function createKnowledgeBase(toolId: string | null, name: string, description: string | undefined, actorId: string) {
  const [kb] = await db.insert(knowledgeBases).values({ toolId, name, description, createdBy: actorId }).returning();
  if (!kb) throw new Error("No fue posible crear la base de conocimiento.");
  await recordAuditEvent({ actorId, action: "knowledge_base.create", resourceType: "knowledge_base", resourceId: kb.id });
  return kb;
}

export async function listKnowledgeBases(toolId?: string) {
  if (toolId) return db.select().from(knowledgeBases).where(eq(knowledgeBases.toolId, toolId));
  return db.select().from(knowledgeBases);
}

export async function disableKnowledgeBase(knowledgeBaseId: string, actorId: string): Promise<void> {
  await db.update(knowledgeBases).set({ disabledAt: new Date() }).where(eq(knowledgeBases.id, knowledgeBaseId));
  await recordAuditEvent({ actorId, action: "knowledge_base.disable", resourceType: "knowledge_base", resourceId: knowledgeBaseId });
}

export async function deleteKnowledgeBase(knowledgeBaseId: string, actorId: string): Promise<void> {
  await db.update(knowledgeBases).set({ deletedAt: new Date() }).where(eq(knowledgeBases.id, knowledgeBaseId));
  await recordAuditEvent({ actorId, action: "knowledge_base.delete", resourceType: "knowledge_base", resourceId: knowledgeBaseId });
}

async function transitionDocument(documentId: string, to: KnowledgeDocumentStatus, extra: Record<string, unknown> = {}) {
  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Documento no encontrado.");
  assertValidDocumentTransition(doc.status as KnowledgeDocumentStatus, to);
  await db.update(knowledgeDocuments).set({ status: to, ...extra }).where(eq(knowledgeDocuments.id, documentId));
}

export interface InitiateDocumentUploadInput {
  knowledgeBaseId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  language?: string;
  actorId: string;
}

export async function initiateDocumentUpload(input: InitiateDocumentUploadInput): Promise<{ documentId: string }> {
  const env = getEnv();
  if (input.sizeBytes <= 0 || input.sizeBytes > env.MAX_UPLOAD_BYTES) {
    throw new ValidationError(`El documento debe pesar entre 1 byte y ${env.MAX_UPLOAD_BYTES} bytes.`);
  }
  if (!ALLOWED_KNOWLEDGE_MIME_TYPES.includes(input.mimeType)) {
    throw new ValidationError(`Tipo de documento no permitido: ${input.mimeType}`);
  }

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      knowledgeBaseId: input.knowledgeBaseId,
      name: input.originalName.slice(0, 255),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      language: input.language ?? "es",
      status: "UPLOADING",
      createdBy: input.actorId,
    })
    .returning({ id: knowledgeDocuments.id });
  if (!doc) throw new Error("No fue posible iniciar la carga del documento.");
  return { documentId: doc.id };
}

export async function completeDocumentUpload(documentId: string, actorId: string, bytes: Buffer): Promise<void> {
  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Documento no encontrado.");
  if (doc.status !== "UPLOADING") throw new ValidationError("Este documento ya fue procesado.");

  if (bytes.length !== doc.sizeBytes) {
    await transitionDocument(documentId, "FAILED", { errorCode: "SIZE_MISMATCH", errorMessage: "El tamaño real no coincide con el declarado." });
    throw new ValidationError("El tamaño real del archivo no coincide con el declarado.");
  }

  const sniffed = sniffMimeType(bytes, doc.mimeType, doc.name);
  if (!sniffed) {
    await transitionDocument(documentId, "FAILED", { errorCode: "INVALID_CONTENT", errorMessage: "El contenido no corresponde a un tipo permitido." });
    throw new ValidationError("El contenido del archivo no corresponde a un tipo permitido.");
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const blobKey = `knowledge/${doc.knowledgeBaseId}/${documentId}-v${doc.version}`;
  await getStorageAdapter().put(blobKey, bytes, sniffed);

  await db.insert(knowledgeDocumentVersions).values({ documentId, version: doc.version, blobKey, checksum });
  await db.update(knowledgeDocuments).set({ blobKey, checksum, mimeType: sniffed }).where(eq(knowledgeDocuments.id, documentId));
  await transitionDocument(documentId, "UPLOADED");
  await transitionDocument(documentId, "VALIDATING");

  const job = await getJobProvider().enqueue("knowledge.process_document", { documentId }, { idempotencyKey: `process-doc:${documentId}:v${doc.version}` });

  await recordAuditEvent({
    actorId,
    action: "knowledge_document.upload_complete",
    resourceType: "knowledge_document",
    resourceId: documentId,
    metadata: { jobId: job.id },
  });
}

export async function reindexDocument(documentId: string, actorId: string): Promise<{ jobId: string }> {
  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Documento no encontrado.");
  if (!["READY", "FAILED"].includes(doc.status)) {
    throw new ValidationError("Solo se puede reindexar un documento listo o fallido.");
  }

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
  await transitionDocument(documentId, "VALIDATING");

  const job = await getJobProvider().enqueue(
    "knowledge.process_document",
    { documentId },
    { idempotencyKey: `reindex-doc:${documentId}:${Date.now()}` },
  );
  await recordAuditEvent({ actorId, action: "knowledge_document.reindex", resourceType: "knowledge_document", resourceId: documentId });
  return { jobId: job.id };
}

export async function disableDocument(documentId: string, actorId: string): Promise<void> {
  await transitionDocument(documentId, "DISABLED");
  await recordAuditEvent({ actorId, action: "knowledge_document.disable", resourceType: "knowledge_document", resourceId: documentId });
}

export async function deleteDocument(documentId: string, actorId: string): Promise<void> {
  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Documento no encontrado.");
  if (doc.blobKey) {
    await getStorageAdapter()
      .del(doc.blobKey)
      .catch(() => undefined);
  }
  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
  await transitionDocument(documentId, "DELETED");
  await recordAuditEvent({ actorId, action: "knowledge_document.delete", resourceType: "knowledge_document", resourceId: documentId });
}

export async function assertCanManageKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  const rows = await db.select({ id: knowledgeBases.id }).from(knowledgeBases).where(and(eq(knowledgeBases.id, knowledgeBaseId))).limit(1);
  if (!rows[0]) throw new ForbiddenError("Base de conocimiento no encontrada.");
}
