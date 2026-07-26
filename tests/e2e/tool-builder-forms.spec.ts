import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "./helpers";

/**
 * Covers the react-hook-form migration of the admin tool-edit sections (previously plain
 * useState): fills each section's form, saves, reloads the page (forcing a fresh server
 * fetch of the persisted config), and asserts the values actually round-tripped through the
 * PATCH endpoint — not just that the components compile/render. Exercises every non-trivial
 * RHF pattern used across the 7 sections: plain register() (Identity), a Controller-backed
 * "one item per line" textarea over a string[] field (Behavior/Safety), a checkbox always
 * forced on and deliberately NOT registered (Capabilities' "text"), and a useFieldArray
 * (Capabilities' externalApiEndpoints).
 */
test.describe("Editor de herramientas: formularios de las secciones", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.superAdmin.email, DEMO_CREDENTIALS.superAdmin.password);
  });

  test("Identidad, Comportamiento, Capacidades y Seguridad persisten sus cambios tras recargar", async ({ page }) => {
    await page.goto("/admin/tools/new");
    const slug = `e2e-rhf-${Date.now()}`;
    await page.getByLabel("Nombre", { exact: true }).fill("Herramienta RHF e2e");
    await page.getByLabel("Nombre corto").fill("RHF");
    await page.getByLabel(/Slug/).fill(slug);
    await page.getByLabel("Descripción breve").fill("Herramienta para probar los formularios migrados.");
    await page.getByRole("button", { name: "Crear herramienta" }).click();
    await expect(page).toHaveURL(/\/admin\/tools\/[0-9a-f-]+$/, { timeout: 10_000 });
    const toolUrl = page.url();

    // Identidad: plain register() fields.
    await page.getByRole("button", { name: "Identidad", exact: true }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Nombre editado por e2e");
    await page.getByLabel("Público objetivo").fill("Personas migrantes");
    await page.getByRole("button", { name: "Guardar identidad" }).click();
    await expect(page.getByText("Identidad guardada.")).toBeVisible();

    // Comportamiento: a Controller-backed line-list field (suggestedQuestions is skipped here,
    // "rules" exercises the same LineListField component) plus a <select>.
    await page.getByRole("button", { name: "Comportamiento", exact: true }).click();
    await page.getByLabel("Prompt del sistema").fill("Eres un asistente de prueba para e2e.");
    await page.getByLabel("Mensaje de bienvenida").fill("Bienvenido a la herramienta de prueba.");
    await page.getByLabel("Aviso de alcance").fill("Este es un aviso de alcance de prueba.");
    await page.getByLabel("Mensaje de error").fill("Ocurrió un error de prueba.");
    await page.getByLabel("Reglas (una por línea)").fill("Regla uno\nRegla dos");
    await page.getByRole("button", { name: "Guardar comportamiento" }).click();
    await expect(page.getByText("Comportamiento guardado.")).toBeVisible();

    // Capacidades: "text" is always-on and deliberately unregistered (proves its default
    // value still submits); toggling "files" on reveals nothing extra, but externalApis
    // toggling drives the useFieldArray panel.
    await page.getByRole("button", { name: "Capacidades", exact: true }).click();
    await page.getByRole("checkbox", { name: /^APIs externas$/ }).check();
    await page.getByRole("button", { name: "Agregar endpoint" }).click();
    await page.locator('[id^="endpoint-name-"]').first().fill("crear_ticket");
    await page.locator('[id^="endpoint-url-"]').first().fill("https://api.ejemplo.org/tickets");
    await page.getByRole("button", { name: "Guardar capacidades" }).click();
    await expect(page.getByText("Capacidades guardadas.")).toBeVisible();

    // Seguridad: a Controller-backed line-list (restrictedTopics) and a Controller-backed
    // checkbox array (allowedInternalTools).
    await page.getByRole("button", { name: "Seguridad", exact: true }).click();
    await page.getByLabel("Temas restringidos (uno por línea)").fill("Tema restringido uno");
    await page.getByRole("checkbox", { name: /Calculadora/ }).check();
    await page.getByRole("button", { name: "Guardar seguridad" }).click();
    await expect(page.getByText("Políticas de seguridad guardadas.")).toBeVisible();

    // Reload forces a fresh server-side loadVersionConfig — proves the PATCHes actually
    // persisted, not just that the in-memory form state looked right before navigating away.
    await page.goto(toolUrl);

    await page.getByRole("button", { name: "Identidad", exact: true }).click();
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Nombre editado por e2e");
    await expect(page.getByLabel("Público objetivo")).toHaveValue("Personas migrantes");

    await page.getByRole("button", { name: "Comportamiento", exact: true }).click();
    await expect(page.getByLabel("Prompt del sistema")).toHaveValue("Eres un asistente de prueba para e2e.");
    await expect(page.getByLabel("Reglas (una por línea)")).toHaveValue("Regla uno\nRegla dos");

    await page.getByRole("button", { name: "Capacidades", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /^Texto/ })).toBeChecked();
    await expect(page.locator('[id^="endpoint-name-"]').first()).toHaveValue("crear_ticket");
    await expect(page.locator('[id^="endpoint-url-"]').first()).toHaveValue("https://api.ejemplo.org/tickets");

    await page.getByRole("button", { name: "Seguridad", exact: true }).click();
    await expect(page.getByLabel("Temas restringidos (uno por línea)")).toHaveValue("Tema restringido uno");
  });
});
