import autocannon from "autocannon";
import { test, expect } from "@playwright/test";

/**
 * §46 "concurrencia" + "rate limiting": real HTTP load against the real running server
 * (not a mock), using autocannon for connection concurrency instead of a browser.
 *
 * Filename prefix "04-": the login rate limiter is keyed by IP, not by email, and shared
 * across the whole webServer session. The last test in this file deliberately exhausts
 * that budget to prove the limiter fires, which would poison every other performance
 * test's loginAs() call if it ran earlier. Numbering forces this file to run last.
 */
test.describe("Rendimiento: concurrencia y rate limiting", () => {
  test("el endpoint de salud sostiene concurrencia sin errores", async ({ baseURL }) => {
    const result = await autocannon({
      url: `${baseURL}/api/v1/health/live`,
      connections: 20,
      duration: 5,
    });

    expect(result.errors).toBe(0);
    expect(result.non2xx).toBe(0);
    expect(result.latency.p99).toBeLessThan(2000);
  });

  test("el catálogo sostiene concurrencia razonable sin errores de servidor", async ({ baseURL }) => {
    const result = await autocannon({
      url: `${baseURL}/login`,
      connections: 10,
      duration: 5,
    });

    expect(result.errors).toBe(0);
    expect(result.non2xx).toBe(0);
  });

  test("el rate limiter de login corta después del umbral configurado", async ({ baseURL }) => {
    // Plain concurrent fetch() rather than autocannon here: the goal is to inspect each
    // response's exact status code (429 specifically, not just "some 4xx" — every one of
    // these requests is already a 401 on invalid credentials, so a generic 4xx count
    // wouldn't actually prove rate limiting fired). The configured limit is 20/15min
    // (see callers of getRateLimiter() in the login route) — 40 concurrent attempts from
    // the same loopback IP must push some of them over that threshold.
    const responses = await Promise.all(
      Array.from({ length: 40 }, () =>
        fetch(`${baseURL}/api/v1/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "rate-limit-probe@example.com", password: "whatever-not-real" }),
        }).then((res) => res.status),
      ),
    );

    const rateLimited = responses.filter((status) => status === 429).length;
    expect(rateLimited).toBeGreaterThan(0);
  });
});
