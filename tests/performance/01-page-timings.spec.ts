import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs, readE2eContext } from "../e2e/helpers";

interface NavTiming {
  ttfb: number;
  domContentLoaded: number;
  loadEvent: number;
}

async function getNavigationTiming(page: import("@playwright/test").Page): Promise<NavTiming> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const nav = entries[0];
    if (!nav) throw new Error("No hay entradas de Navigation Timing disponibles.");
    return {
      ttfb: nav.responseStart - nav.startTime,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      loadEvent: nav.loadEventEnd - nav.startTime,
    };
  });
}

// Generous thresholds deliberately: this runs in a shared, unpredictable sandboxed
// container, not representative production hardware — these are sanity ceilings that
// catch a real regression (e.g. an accidental N+1 reintroduced later), not an SLA.
const MAX_TTFB_MS = 3000;
const MAX_LOAD_MS = 6000;

test.describe("Rendimiento: tiempo de carga de páginas reales (Navigation Timing API)", () => {
  test("tiempo inicial de carga: /login", async ({ page }) => {
    await page.goto("/login");
    const timing = await getNavigationTiming(page);
    expect(timing.ttfb).toBeLessThan(MAX_TTFB_MS);
    expect(timing.loadEvent).toBeLessThan(MAX_LOAD_MS);
  });

  test("navegación al catálogo", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto("/tools");
    const timing = await getNavigationTiming(page);
    expect(timing.ttfb).toBeLessThan(MAX_TTFB_MS);
    expect(timing.loadEvent).toBeLessThan(MAX_LOAD_MS);
  });

  test("apertura de una herramienta de chat", async ({ page }) => {
    const { toolSlug } = readE2eContext();
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    await page.goto(`/tools/${toolSlug}/chat`);
    const timing = await getNavigationTiming(page);
    expect(timing.ttfb).toBeLessThan(MAX_TTFB_MS);
    expect(timing.loadEvent).toBeLessThan(MAX_LOAD_MS);
  });

  test("dashboard administrativo (varias consultas agregadas)", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.superAdmin.email, DEMO_CREDENTIALS.superAdmin.password);
    await page.goto("/admin/analytics");
    const timing = await getNavigationTiming(page);
    expect(timing.ttfb).toBeLessThan(MAX_TTFB_MS);
    expect(timing.loadEvent).toBeLessThan(MAX_LOAD_MS);
  });
});
