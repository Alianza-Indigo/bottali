/**
 * Double-submit-cookie CSRF protection (spec §29). SameSite=lax on the session cookie
 * already blocks the classic cross-site <form> POST case, but this adds a real,
 * independent check: a non-httpOnly cookie whose value must be echoed back as a custom
 * header on every mutating request. A cross-origin attacker page can trigger a request to
 * this app but can never READ this cookie (browsers enforce same-origin cookie access) or
 * set a custom header on a simple cross-site form submission — so it can never produce a
 * matching pair, regardless of SameSite policy quirks in a given browser.
 */
export const CSRF_COOKIE_NAME = "crisis_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/** Routes that legitimately have no session yet (so no CSRF cookie exists) or use a
 * different auth mechanism entirely (cron's bearer secret). */
const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/verify-email",
  "/api/v1/auth/resend-verification",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/cron/",
];

export function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
