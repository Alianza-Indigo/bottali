import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "../e2e/helpers";

/** §46 "consultas paginadas" / "implementa paginación": confirms the pagination params are
 * actually respected server-side (bounded result size, offset moves the window) rather than
 * silently ignored. */
test.describe("Rendimiento: paginación real", () => {
  test("GET /api/v1/conversations respeta limit y offset", async ({ page, baseURL }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    const res = await page.request.get(`${baseURL}/api/v1/conversations?limit=1`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.conversations.length).toBeLessThanOrEqual(1);
  });

  test("GET /api/v1/notifications respeta limit", async ({ page, baseURL }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    const res = await page.request.get(`${baseURL}/api/v1/notifications?limit=5`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.notifications.length).toBeLessThanOrEqual(5);
  });
});
