import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

test.describe("Autenticación", () => {
  test("el registro público redirige al acceso con Google", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: "Continuar con Google" })).toBeVisible();
  });

  test("la pantalla de acceso conserva un destino interno seguro", async ({ page }) => {
    await page.goto("/login?next=%2Ftools");
    await expect(page.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
      "href",
      "/api/v1/auth/google/start?next=%2Ftools",
    );
  });

  test("la pantalla de acceso descarta destinos externos", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example");
    await expect(page.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
      "href",
      "/api/v1/auth/google/start?next=%2Fdashboard",
    );
  });

  test("el endpoint heredado rechaza credenciales inválidas de forma genérica", async ({ page }) => {
    await page.goto("/login");
    const response = await page.request.post("/api/v1/auth/login", {
      data: { email: "no-existe@example.com", password: "cualquier-clave" },
    });
    expect(response.status()).toBe(401);
    expect(await response.text()).toMatch(/correo o contraseña incorrectos/i);
  });

  test("login con credenciales de demo lleva al dashboard autenticado", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
  });
});
