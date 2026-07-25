import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs, readE2eContext } from "./helpers";

test("un usuario puede activar una herramienta publicada y conversar con ella", async ({ page }) => {
  const { toolSlug } = readE2eContext();

  await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

  await page.goto("/tools");
  const card = page.getByTestId(`tool-card-${toolSlug}`);
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Activar" }).click();
  await expect(card.getByRole("link", { name: "Abrir" })).toBeVisible();

  await card.getByRole("link", { name: "Abrir" }).click();
  await expect(page).toHaveURL(new RegExp(`/tools/${toolSlug}/chat`));

  await page.getByLabel("Lista de conversaciones").getByRole("button", { name: "Nueva conversación" }).click();

  const chatInput = page.getByLabel("Escribe un mensaje");
  await expect(chatInput).toBeVisible();
  await chatInput.fill("Hola, esto es una prueba automatizada.");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText(/recibí tu mensaje/i)).toBeVisible({ timeout: 15_000 });
});
