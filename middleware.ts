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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const hasCookie = request.cookies.has(COOKIE_NAME);
  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
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
  ],
};
