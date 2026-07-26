import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { knowledgeBases, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import "@/lib/jobs/handlers";
import { createKnowledgeBase, completeDocumentUpload, initiateDocumentUpload } from "@/lib/knowledge/service";
import { retrieveRelevantChunks } from "@/lib/knowledge/retrieval";
import { initiateUpload, completeUpload, deleteUploadedFile } from "@/lib/files/service";

/**
 * §46 "recuperación RAG" / "carga de archivos": these run against the real fake providers
 * (deterministic, no network) — the point isn't chasing a strict SLA on shared sandboxed
 * hardware, it's catching an accidental regression (e.g. an unbounded scan reintroduced into
 * retrieveRelevantChunks) that would blow through even a generous ceiling.
 */
describe("rendimiento: recuperación RAG y carga de archivos", () => {
  let actorId: string;
  let knowledgeBaseId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `perf-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;

    const kb = await createKnowledgeBase(null, "Base de rendimiento", "KB para pruebas de rendimiento", actorId);
    knowledgeBaseId = kb.id;

    const content = Buffer.from(
      Array.from({ length: 20 }, (_, i) => `Sección ${i}: contenido de prueba sobre políticas de privacidad y seguridad de datos.`).join("\n\n"),
      "utf-8",
    );
    const { documentId } = await initiateDocumentUpload({
      knowledgeBaseId,
      originalName: "perf.md",
      mimeType: "text/markdown",
      sizeBytes: content.length,
      actorId,
    });
    await completeDocumentUpload(documentId, actorId, content);
  });

  afterAll(async () => {
    if (knowledgeBaseId) await db.delete(knowledgeBases).where(eq(knowledgeBases.id, knowledgeBaseId));
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("recupera fragmentos relevantes de la base de conocimiento en un tiempo acotado", async () => {
    const started = Date.now();
    const chunks = await retrieveRelevantChunks(knowledgeBaseId, "políticas de privacidad", 5);
    const elapsedMs = Date.now() - started;

    expect(chunks.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it("completa el ciclo de carga de un archivo en un tiempo acotado", async () => {
    const content = Buffer.from("Contenido de archivo de prueba de rendimiento.", "utf-8");

    const started = Date.now();
    const { fileId } = await initiateUpload({
      userId: actorId,
      originalName: "perf-upload.txt",
      mimeType: "text/plain",
      sizeBytes: content.length,
    });
    await completeUpload(fileId, actorId, content);
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(5000);

    await deleteUploadedFile(fileId, actorId);
  });
});
