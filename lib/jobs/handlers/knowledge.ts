import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { registerJobHandler } from "../registry";
import { getStorageAdapter } from "@/lib/storage";
import { extractText, normalizeText } from "@/lib/knowledge/extraction";
import { chunkText } from "@/lib/knowledge/chunking";
import { assertValidDocumentTransition, type KnowledgeDocumentStatus } from "@/lib/knowledge/state-machine";
import { getToolEmbeddingProvider } from "@/lib/tools/provider-credentials";

const payloadSchema = z.object({ documentId: z.string().uuid() });

async function setStatus(documentId: string, from: KnowledgeDocumentStatus, to: KnowledgeDocumentStatus, extra: Record<string, unknown> = {}) {
  assertValidDocumentTransition(from, to);
  await db.update(knowledgeDocuments).set({ status: to, ...extra }).where(eq(knowledgeDocuments.id, documentId));
}

/**
 * §14 steps 8–14: extract → normalize → chunk → embed → store vectors → index → READY.
 * Runs as a background job (never inline in the upload request) so large documents can't
 * exceed a serverless function's execution window.
 */
registerJobHandler("knowledge.process_document", async (rawPayload, context) => {
  const { documentId } = payloadSchema.parse(rawPayload);

  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) throw new Error(`Documento no encontrado: ${documentId}`);
  if (!doc.blobKey) throw new Error("El documento no tiene contenido cargado.");

  try {
    await setStatus(documentId, doc.status as KnowledgeDocumentStatus, "PROCESSING");
    await context.reportProgress(10);

    const bytes = await getStorageAdapter().get(doc.blobKey);
    const rawText = await extractText(bytes, doc.mimeType);
    const text = normalizeText(rawText);
    if (!text) throw new Error("No fue posible extraer texto del documento.");
    await context.reportProgress(35);

    if (await context.isCancelled()) {
      await db.update(knowledgeDocuments).set({ status: "FAILED", errorCode: "CANCELLED", errorMessage: "Cancelado por el usuario." }).where(eq(knowledgeDocuments.id, documentId));
      return { cancelled: true };
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("El documento no produjo fragmentos indexables.");
    await context.reportProgress(50);

    const baseRows = await db
      .select({ toolId: knowledgeBases.toolId })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, doc.knowledgeBaseId))
      .limit(1);
    const toolId = baseRows[0]?.toolId;
    if (!toolId) throw new Error("La base de conocimiento no está vinculada a una herramienta.");
    const embeddingProvider = await getToolEmbeddingProvider(toolId);
    const embeddings = await embeddingProvider.embedTexts(chunks);
    await context.reportProgress(80);

    await setStatus(documentId, "PROCESSING", "INDEXING");

    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i];
      const content = chunks[i];
      if (!embedding || !content) continue;
      await db.insert(knowledgeChunks).values({
        documentId,
        knowledgeBaseId: doc.knowledgeBaseId,
        chunkIndex: i,
        content,
        embedding,
        metadata: {
          embeddingProvider: embeddingProvider.key,
          embeddingDimensions: embeddingProvider.dimensions,
        },
      });
    }

    await db
      .update(knowledgeDocuments)
      .set({ status: "READY", processedAt: new Date(), errorCode: null, errorMessage: null })
      .where(eq(knowledgeDocuments.id, documentId));
    await context.reportProgress(100);

    return { chunks: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido durante el procesamiento.";
    // Only move the document to the terminal FAILED state once the job's own retry
    // budget is exhausted — an earlier attempt should be able to retry (network blip,
    // transient embedding-provider error) without the document state machine treating
    // it as a hard failure it then has to be manually reindexed out of.
    if (context.attempt >= context.maxAttempts) {
      await db
        .update(knowledgeDocuments)
        .set({ status: "FAILED", errorCode: "PROCESSING_ERROR", errorMessage: message })
        .where(eq(knowledgeDocuments.id, documentId));
    }
    throw error;
  }
});
