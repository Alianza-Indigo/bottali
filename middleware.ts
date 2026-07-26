import { NextResponse, type NextRequest } from "next/server";

// Coarse, cookie-presence-only redirect for UX. This runs on the Edge runtime and has
// no database access, so it MUST NOT be treated as the authorization boundary — every
// protected Server Component / Route Handler independently calls requireCurrentUser()
// and requirePermission() server-side. Removing this middleware would only degrade the
// redirect experience, never open an authorization hole.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tools",
  "/conversations",
  "/files",
  "/notifications",
  "/profile",
  "/accessibility",
  "/privacy",
  "/admin",
];

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "crisis_session";
const REQUEST_ID_HEADER = "x-request-id";

/**
 * §35 observability: every request (page or API) gets a request ID here — either the one a
 * caller/proxy already set, or a fresh one — propagated both to the downstream Server
 * Component/Route Handler (via the request headers, readable through next/headers'
 * headers()) and back to the client (as a response header, useful for support/bug reports).
 * This is what lets lib/audit/log.ts's correlationId actually correlate multiple audit
 * events from the same request, instead of each one minting its own random ID.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected) {
    const hasCookie = request.cookies.has(COOKIE_NAME);
    if (!hasCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      const response = NextResponse.redirect(loginUrl);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tools/:path*",
    "/conversations/:path*",
    "/files/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/accessibility/:path*",
    "/privacy/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
