const CSRF_COOKIE_NAME = "crisis_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** For the few call sites that use the raw `fetch()` API directly instead of apiFetch
 * (streaming POSTs in ChatWindow, raw-bytes upload-complete calls) — same CSRF token,
 * spread into that request's own headers. */
export function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE_NAME);
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiErrorBody {
  error?: { code: string; message: string; issues?: unknown };
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  // A FormData body (file/audio uploads) must NOT get a manual Content-Type: the browser
  // sets its own "multipart/form-data; boundary=..." header, which forcing JSON here would
  // override and break.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const method = (init?.method ?? "GET").toUpperCase();
  const extraHeaders = MUTATING_METHODS.has(method) ? csrfHeaders() : {};
  const res = await fetch(input, {
    ...init,
    headers: isFormData
      ? { ...extraHeaders, ...init?.headers }
      : { "Content-Type": "application/json", ...extraHeaders, ...init?.headers },
  });

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(body.error?.message ?? "Ocurrió un error inesperado.", body.error?.code ?? "UNKNOWN", res.status, body.error?.issues);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "DELETE" });
}
