import { NextResponse } from "next/server";
import { createGoogleAuthorizationUrl } from "@/lib/auth/google";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authorizationUrl = await createGoogleAuthorizationUrl(
      url.searchParams.get("next"),
    );
    return NextResponse.redirect(authorizationUrl);
  } catch {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(loginUrl);
  }
}
