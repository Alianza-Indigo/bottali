import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs, readE2eContext } from "./helpers";

test("un usuario puede grabar voz, transcribirla, editarla y escuchar la respuesta", async ({ page }) => {
  // Real getUserMedia()/MediaRecorder work, unlike the rest of the suite — give it double the
  // default budget so a busy runner (this is test-order-late, after 18 prior contexts in the
  // same reused browser process) doesn't false-fail a healthy recording as frozen.
  test.setTimeout(60_000);

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

  const micButton = page.getByRole("button", { name: "Grabar mensaje de voz" });
  await expect(micButton).toBeVisible();
  await micButton.click();
  // getUserMedia() is a real async browser call; under CI load a cold start can take longer
  // than Playwright's 5s default, so this needs the same generous timeout as the other
  // async-API assertions below rather than the implicit default.
  await expect(page.getByRole("button", { name: "Detener grabación de voz" })).toBeVisible({ timeout: 10_000 });

  // Give the fake media stream a moment to actually accumulate audio frames before stopping.
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Detener grabación de voz" }).click();

  const chatInput = page.getByLabel("Escribe un mensaje");
  await expect(chatInput).toHaveValue(/transcripción simulada/i, { timeout: 10_000 });

  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/recibí tu mensaje/i)).toBeVisible({ timeout: 15_000 });

  const playButton = page.getByRole("button", { name: /Escuchar/ });
  await expect(playButton).toBeVisible();
  await playButton.click();
  await expect(page.getByRole("button", { name: /Detener/ }).last()).toBeVisible();
});
