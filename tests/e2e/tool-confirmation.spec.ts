import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db } from "@/lib/db/client";
import { tools, users } from "@/db/schema";
import { activateToolForUser } from "@/lib/tools/access";
import { createPublishedTestTool } from "../fixtures/tool-factory";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

/**
 * §15 human-in-the-loop, exercised through the real browser UI (not just the pipeline
 * directly): a tool call that requires confirmation must pause visibly in the chat, and
 * approving it must actually run the tool and finish the turn — proves ChatWindow's new
 * confirmation card/approve wiring works end-to-end, not just the backend logic already
 * covered by tests/integration/tool-confirmations.test.ts.
 */
test("un usuario ve la tarjeta de confirmación y al aprobarla la herramienta se ejecuta de verdad", async ({ page }) => {
  const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
  if (!demoUser) throw new Error("No fue posible localizar al usuario demo.");

  const { toolId, slug } = await createPublishedTestTool(demoUser.id, {
    internalTools: ["calculator"],
    confirmationsRequired: ["calculator"],
  });
  await activateToolForUser(toolId, demoUser.id);

  await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

  await page.goto(`/tools/${slug}/chat`);
  await page.getByLabel("Lista de conversaciones").getByRole("button", { name: "Nueva conversación" }).click();

  const chatInput = page.getByLabel("Escribe un mensaje");
  await expect(chatInput).toBeVisible();
  await chatInput.fill('HERRAMIENTA:calculator {"expression":"6*7"}');
  await page.getByRole("button", { name: "Enviar" }).click();

  const confirmationCard = page.getByTestId("tool-confirmation-card");
  await expect(confirmationCard).toBeVisible({ timeout: 15_000 });
  await expect(confirmationCard.getByText("calculator", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText(/42/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("El asistente quiere usar una herramienta")).not.toBeVisible();

  await db.delete(tools).where(eq(tools.id, toolId));
});
