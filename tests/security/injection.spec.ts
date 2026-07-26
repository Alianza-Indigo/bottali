import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db } from "@/lib/db/client";
import { conversations, uploadedFiles, users } from "@/db/schema";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation } from "@/lib/conversations/service";
import { initiateUpload, completeUpload } from "@/lib/files/service";
import { createPublishedTestTool } from "../fixtures/tool-factory";
import { DEMO_CREDENTIALS, loginAs } from "../e2e/helpers";

/**
 * Covers the injection categories from the spec-gap audit: XSS, SQL injection, and path
 * traversal. Drizzle's query builder always parameterizes values (no raw string
 * concatenation anywhere in this codebase), so a real SQL-injection payload can't actually
 * corrupt a query here — the test proves that by using the payload in a real write and then
 * verifying the database is unaffected, rather than trying to force an artificial failure.
 */
test.describe("Prevención de inyección", () => {
  test("una carga XSS en un mensaje de chat se muestra como texto literal y nunca se ejecuta", async ({ page }) => {
    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
    const { toolId, slug } = await createPublishedTestTool(demoUser!.id, {});
    await activateToolForUser(toolId, demoUser!.id);

    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto(`/tools/${slug}/chat`);
    await page.getByLabel("Lista de conversaciones").getByRole("button", { name: "Nueva conversación" }).click();

    const payload = '<img src=x onerror="window.__xssFired = true">';
    const chatInput = page.getByLabel("Escribe un mensaje");
    await expect(chatInput).toBeVisible();
    await chatInput.fill(payload);
    await page.getByRole("button", { name: "Enviar" }).click();

    // The literal tag text must be visible (React escapes it into text nodes)...
    await expect(page.getByText(payload, { exact: false })).toBeVisible({ timeout: 15_000 });
    // ...and it must never have been parsed into a real, executing <img> element.
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired)).toBeUndefined();

    await db.delete(conversations).where(eq(conversations.toolId, toolId));
  });

  test("un payload de inyección SQL en el título de una conversación se trata como texto literal, sin afectar la base de datos", async ({
    page,
  }) => {
    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
    const { toolId, versionId } = await createPublishedTestTool(demoUser!.id, {});
    await activateToolForUser(toolId, demoUser!.id);
    const conversation = await createConversation(demoUser!.id, toolId, versionId);

    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === "crisis_csrf");
    const payload = "'; DROP TABLE users; --";
    const res = await page.request.patch(`/api/v1/conversations/${conversation.id}`, {
      headers: csrfCookie ? { "x-csrf-token": csrfCookie.value } : {},
      data: { title: payload },
    });
    expect(res.status()).toBe(200);

    const [row] = await db.select({ title: conversations.title }).from(conversations).where(eq(conversations.id, conversation.id)).limit(1);
    // Stored verbatim as a string — Drizzle parameterizes the UPDATE, so the payload never
    // reaches the database as executable SQL.
    expect(row!.title).toBe(payload);

    // The `users` table (and this very demo account) must still exist and work afterward —
    // the strongest possible proof the payload had zero effect on the schema/data.
    const stillLoggedIn = await page.request.get("/api/v1/me");
    expect(stillLoggedIn.status()).toBe(200);

    await db.delete(conversations).where(eq(conversations.id, conversation.id));
  });

  test("el nombre de un archivo subido nunca se usa para construir la ruta de almacenamiento (path traversal)", async () => {
    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
    const content = Buffer.from("contenido de prueba, no debe filtrarse fuera de su carpeta.", "utf-8");
    const maliciousName = "../../../../etc/passwd.txt";

    const { fileId } = await initiateUpload({
      userId: demoUser!.id,
      originalName: maliciousName,
      mimeType: "text/plain",
      sizeBytes: content.length,
    });
    await completeUpload(fileId, demoUser!.id, content);

    const [row] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1);
    expect(row).toBeTruthy();
    // sanitizeBlobKey (lib/files/service.ts) derives the storage key only from the
    // server-generated file id + a whitelisted extension — never from originalName — so a
    // traversal payload in the filename can't ever reach the storage adapter's key.
    expect(row!.blobKey).not.toContain("..");
    expect(row!.blobKey).not.toContain("/etc/");
    expect(row!.blobKey).toContain(fileId);
    // The original (malicious-looking) name is preserved only as inert display metadata.
    expect(row!.originalName).toBe(maliciousName);

    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, fileId));
  });
});
