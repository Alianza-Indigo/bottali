import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

test.describe("Panel administrativo", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.superAdmin.email, DEMO_CREDENTIALS.superAdmin.password);
  });

  test("un super admin puede entrar al panel y ver la navegación administrativa", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Navegación administrativa" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Herramientas" })).toBeVisible();
  });

  test("un super admin puede crear una herramienta desde el asistente", async ({ page }) => {
    await page.goto("/admin/tools/new");
    const slug = `e2e-admin-${Date.now()}`;
    await page.getByLabel("Nombre", { exact: true }).fill("Herramienta creada por e2e");
    await page.getByLabel("Nombre corto").fill("E2E");
    await page.getByLabel(/Slug/).fill(slug);
    await page.getByLabel("Descripción breve").fill("Herramienta creada por la suite end-to-end.");
    await page.getByRole("button", { name: "Crear herramienta" }).click();

    await expect(page).toHaveURL(/\/admin\/tools\/[0-9a-f-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("navigation", { name: "Secciones de configuración" })).toBeVisible();
    await expect(page.getByText("DRAFT").first()).toBeVisible();
  });

  test("un super admin puede crear un usuario que recibe un correo para definir su contraseña", async ({ page }) => {
    await page.goto("/admin/users");
    const email = `e2e-user-${Date.now()}@example.com`;
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Nombre").fill("Persona creada por e2e");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });
  });

  test("un usuario final es redirigido fuera del panel administrativo", async ({ page }) => {
    await page.context().clearCookies();
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
