import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs, readE2eContext } from "./helpers";

test.describe("PWA", () => {
  test("los assets del shell (manifest, iconos, offline) responden", async ({ request }) => {
    for (const path of [
      "/manifest.webmanifest",
      "/sw.js",
      "/offline.html",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
      "/icons/apple-touch-icon.png",
    ]) {
      const res = await request.get(path);
      expect(res.status(), `${path} debería responder 200`).toBe(200);
    }
  });

  test("el manifest de la plataforma referencia los tres iconos requeridos", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    const manifest = await res.json();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
  });

  test("el service worker se registra y queda activo en el navegador", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/login");
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active);
    });
    expect(errors).toEqual([]);
  });

  test("una herramienta publicada con PWA habilitada expone un manifest dinámico propio", async ({ page }) => {
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

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toMatch(/^\/api\/v1\/catalog\/[0-9a-f-]+\/manifest$/);

    const manifestRes = await page.request.get(manifestHref!);
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.scope).toBe("/tools/");
  });
});
