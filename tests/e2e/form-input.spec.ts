import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db } from "@/lib/db/client";
import { tools, users } from "@/db/schema";
import { activateToolForUser } from "@/lib/tools/access";
import { createPublishedTestTool } from "../fixtures/tool-factory";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

/**
 * capabilities.forms, exercised through the real browser UI: when the model requests
 * collect_form_input, the chat must render an actual fillable form (not raw JSON), and
 * submitting it must resume the turn with the answers as the tool's result.
 */
test("un usuario completa un formulario solicitado por el asistente y la respuesta lo refleja", async ({ page }) => {
  const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
  if (!demoUser) throw new Error("No fue posible localizar al usuario demo.");

  const { toolId, slug } = await createPublishedTestTool(demoUser.id, {
    internalTools: ["collect_form_input"],
    forms: true,
  });
  await activateToolForUser(toolId, demoUser.id);

  await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

  await page.goto(`/tools/${slug}/chat`);
  await page.getByLabel("Lista de conversaciones").getByRole("button", { name: "Nueva conversación" }).click();

  const chatInput = page.getByLabel("Escribe un mensaje");
  await expect(chatInput).toBeVisible();
  await chatInput.fill('HERRAMIENTA:collect_form_input {"fields":[{"name":"nombre","label":"Nombre"}],"prompt":"Necesito tu nombre"}');
  await page.getByRole("button", { name: "Enviar" }).click();

  const formCard = page.getByTestId("tool-confirmation-card");
  await expect(formCard).toBeVisible({ timeout: 15_000 });
  await expect(formCard.getByText("Necesito tu nombre")).toBeVisible();

  await formCard.getByLabel("Nombre").fill("Ada Lovelace");
  await formCard.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText(/Ada Lovelace/)).toBeVisible({ timeout: 15_000 });
  await expect(formCard).not.toBeVisible();

  await db.delete(tools).where(eq(tools.id, toolId));
});
