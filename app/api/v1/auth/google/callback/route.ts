import { NextResponse } from "next/server";
import {
  clearGoogleFlowCookies,
  completeGoogleAuthorization,
  findOrCreateGoogleUser,
} from "@/lib/auth/google";
import { createSession, isMfaEnabled } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/log";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code || !state) {
    await clearGoogleFlowCookies().catch(() => undefined);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", oauthError === "access_denied" ? "google_denied" : "google_failed");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { identity, returnPath } = await completeGoogleAuthorization(code, state);
    const { userId, created } = await findOrCreateGoogleUser(identity);
    const mfaRequired = getEnv().ENABLE_MFA ? await isMfaEnabled(userId) : false;
    await createSession(userId, { requireMfaVerification: mfaRequired });
    await recordAuditEvent({
      actorId: userId,
      action: mfaRequired ? "auth.google.login.mfa_pending" : "auth.google.login",
      resourceType: "user",
      resourceId: userId,
      metadata: { created },
    });
    if (mfaRequired) {
      const mfaUrl = new URL("/login/mfa", request.url);
      mfaUrl.searchParams.set("next", returnPath);
      return NextResponse.redirect(mfaUrl);
    }
    return NextResponse.redirect(new URL(returnPath, request.url));
  } catch {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "google_failed");
    return NextResponse.redirect(loginUrl);
  }
}
