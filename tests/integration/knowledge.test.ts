import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeChunks, knowledgeDocuments, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import "@/lib/jobs/handlers";
import { createKnowledgeBase, completeDocumentUpload, initiateDocumentUpload, reindexDocument, deleteDocument } from "@/lib/knowledge/service";
import { retrieveRelevantChunks } from "@/lib/knowledge/retrieval";

// JOB_PROVIDER defaults to "sync" (see .env.local / lib/env.ts), so getJobProvider().enqueue()
// inside completeDocumentUpload runs the "knowledge.process_document" handler inline and
// returns only once it has finished — no manual job-polling needed in this test.
describe("knowledge base ingestion pipeline (real Postgres, fake embedding provider)", () => {
  let actorId: string;
  let knowledgeBaseId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `kb-pipeline-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;

    const kb = await createKnowledgeBase(null, "Base de prueba", "KB de pruebas automatizadas", actorId);
    knowledgeBaseId = kb.id;
  });

  afterAll(async () => {
    if (knowledgeBaseId) await db.delete(knowledgeBases).where(eq(knowledgeBases.id, knowledgeBaseId));
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("ingests a markdown document end-to-end: upload -> extract -> chunk -> embed -> index", async () => {
    const content = Buffer.from(
      [
        "# Manual de la plataforma",
        "",
        "La plataforma permite crear herramientas conversacionales personalizadas para cada equipo.",
        "Cada herramienta tiene su propia identidad, prompt y modelo configurado de forma independiente.",
        "",
        "## Seguridad",
        "",
        "Toda conversación pasa por moderación de entrada y de salida antes de mostrarse al usuario final.",
      ].join("\n"),
      "utf-8",
    );

    const { documentId } = await initiateDocumentUpload({
      knowledgeBaseId,
      originalName: "manual.md",
      mimeType: "text/markdown",
      sizeBytes: content.length,
      actorId,
    });

    await completeDocumentUpload(documentId, actorId, content);

    const doc = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
    expect(doc[0]!.status).toBe("READY");
    expect(doc[0]!.processedAt).toBeTruthy();

    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.embedding.length).toBe(1536);

    const retrieved = await retrieveRelevantChunks(knowledgeBaseId, "¿Qué moderación se aplica a las conversaciones?", 3);
    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved[0]!.content.length).toBeGreaterThan(0);
  });

  it("rejects a document whose declared MIME type doesn't match its real content", async () => {
    const fakeContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
    const { documentId } = await initiateDocumentUpload({
      knowledgeBaseId,
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: fakeContent.length,
      actorId,
    });

    await expect(completeDocumentUpload(documentId, actorId, fakeContent)).rejects.toThrow();

    const doc = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
    expect(doc[0]!.status).toBe("FAILED");
  });

  it("reindexes a document, replacing its chunks", async () => {
    const content = Buffer.from("Contenido corto para reindexar. ".repeat(5), "utf-8");
    const { documentId } = await initiateDocumentUpload({
      knowledgeBaseId,
      originalName: "reindex.txt",
      mimeType: "text/plain",
      sizeBytes: content.length,
      actorId,
    });
    await completeDocumentUpload(documentId, actorId, content);

    const beforeChunks = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
    expect(beforeChunks.length).toBeGreaterThan(0);

    await reindexDocument(documentId, actorId);

    const doc = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
    expect(doc[0]!.status).toBe("READY");

    const afterChunks = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));
    expect(afterChunks.length).toBeGreaterThan(0);

    await deleteDocument(documentId, actorId);
    const deleted = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
    expect(deleted[0]!.status).toBe("DELETED");
  });
});
