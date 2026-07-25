import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

test.describe("Autenticación", () => {
  test("el registro válido muestra la confirmación de verificación", async ({ page }) => {
    await page.goto("/register");
    const unique = `e2e-${Date.now()}@example.com`;
    await page.getByLabel("Nombre").fill("Persona de prueba");
    await page.getByLabel("Correo electrónico").fill(unique);
    await page.getByLabel("Contraseña").fill("ClaveSegura123");
    await page.getByLabel(/Acepto el aviso de privacidad/i).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(/recibirás instrucciones para verificar tu cuenta/i)).toBeVisible();
  });

  test("login con credenciales inválidas muestra un error genérico", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("no-existe@example.com");
    await page.getByLabel("Contraseña").fill("cualquier-clave");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText(/correo o contraseña incorrectos/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login con credenciales de demo lleva al dashboard autenticado", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
  });
});
