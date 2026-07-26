import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs, readE2eContext } from "../e2e/helpers";

/** §46 "inicio de streaming": measures real time-to-first-byte of the NDJSON stream a sent
 * message produces, using an authenticated browser session (real cookies, real pipeline). */
test("tiempo hasta el primer byte de una respuesta en streaming", async ({ page }) => {
  const { toolSlug } = readE2eContext();
  await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

  await page.goto("/tools");
  const card = page.getByTestId(`tool-card-${toolSlug}`);
  const activateButton = card.getByRole("button", { name: "Activar" });
  if (await activateButton.isVisible().catch(() => false)) {
    await activateButton.click();
    await expect(card.getByRole("link", { name: "Abrir" })).toBeVisible();
  }
  await card.getByRole("link", { name: "Abrir" }).click();
  await expect(page).toHaveURL(new RegExp(`/tools/${toolSlug}/chat`));

  await page.getByLabel("Lista de conversaciones").getByRole("button", { name: "Nueva conversación" }).click();
  const chatInput = page.getByLabel("Escribe un mensaje");
  await expect(chatInput).toBeVisible();

  const started = Date.now();
  await chatInput.fill("Mensaje de prueba de rendimiento de streaming.");
  await page.getByRole("button", { name: "Enviar" }).click();

  // The streaming placeholder ("Generando…") appears the moment the first NDJSON delta
  // event arrives — that's this app's real "time to first byte" for a chat response.
  await expect(page.getByText(/Generando…|recibí tu mensaje/i).first()).toBeVisible({ timeout: 15_000 });
  const elapsedMs = Date.now() - started;

  expect(elapsedMs).toBeLessThan(8000);
});
