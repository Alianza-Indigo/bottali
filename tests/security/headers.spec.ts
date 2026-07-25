import { test, expect } from "@playwright/test";

test.describe("Cabeceras de seguridad", () => {
  test("las páginas públicas envían las cabeceras de seguridad esperadas", async ({ request }) => {
    const res = await request.get("/login");
    const headers = res.headers();

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });

  test("las respuestas de la API también llevan las cabeceras de seguridad", async ({ request }) => {
    const res = await request.get("/api/v1/health/live");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("un endpoint protegido rechaza el acceso sin sesión", async ({ request }) => {
    const res = await request.get("/api/v1/me");
    expect(res.status()).toBe(401);
  });

  test("el manifest dinámico por herramienta exige sesión", async ({ request }) => {
    const res = await request.get("/api/v1/catalog/00000000-0000-0000-0000-000000000000/manifest");
    expect(res.status()).toBe(401);
  });
});
