import { test, expect } from "@playwright/test";
import { DEMO_CREDENTIALS, loginAs } from "../e2e/helpers";

/**
 * §29 CSRF: double-submit-cookie check in middleware.ts. A cross-site attacker can ride the
 * session cookie along on a forged request, but can never read the non-httpOnly CSRF cookie
 * (browsers block cross-origin cookie access) to also set it as the X-CSRF-Token header —
 * so "cookie present, header missing/wrong" is exactly the shape of a forged request.
 */
test.describe("Protección CSRF", () => {
  test("una solicitud mutante sin el header X-CSRF-Token es rechazada aunque la cookie de sesión sea válida", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    // page.request shares the browser context's cookies (including the CSRF cookie) but,
    // unlike the app's own apiFetch, does NOT automatically echo it as a header — simulating
    // exactly what a forged cross-site request looks like.
    const res = await page.request.post("/api/v1/notifications/read-all");
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("CSRF_VALIDATION_FAILED");
  });

  test("la misma solicitud con el token CSRF correcto tiene éxito", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === "crisis_csrf");
    expect(csrfCookie).toBeTruthy();

    const res = await page.request.post("/api/v1/notifications/read-all", {
      headers: { "x-csrf-token": csrfCookie!.value },
    });
    expect(res.status()).toBe(200);
  });

  test("login no requiere token CSRF (no existe sesión todavía)", async ({ page }) => {
    const res = await page.request.post("/api/v1/auth/login", {
      data: { email: DEMO_CREDENTIALS.user.email, password: DEMO_CREDENTIALS.user.password },
    });
    expect(res.status()).not.toBe(403);
  });
});
