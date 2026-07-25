import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_CREDENTIALS, loginAs } from "../e2e/helpers";

/** WCAG 2.2 AA smoke pass (spec §26/§45): scans representative public and authenticated
 * pages for automatically detectable violations. Axe cannot certify AA compliance on its
 * own (manual review is still required for things like reading order or focus traps), but
 * it reliably catches missing labels, contrast failures, and invalid ARIA — a real bar, not
 * a rubber stamp. */
async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length > 0) {
    console.log(JSON.stringify(serious, null, 2));
  }
  expect(serious, `Violaciones serias/críticas de accesibilidad en ${page.url()}`).toEqual([]);
}

test.describe("Accesibilidad (axe, WCAG 2.2 AA)", () => {
  test("página de login", async ({ page }) => {
    await page.goto("/login");
    await expectNoSeriousViolations(page);
  });

  test("página de registro", async ({ page }) => {
    await page.goto("/register");
    await expectNoSeriousViolations(page);
  });

  test("dashboard autenticado", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await expectNoSeriousViolations(page);
  });

  test("catálogo de herramientas", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto("/tools");
    await expectNoSeriousViolations(page);
  });

  test("configuración de accesibilidad", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto("/accessibility");
    await expectNoSeriousViolations(page);
  });
});
