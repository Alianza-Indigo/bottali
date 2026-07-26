import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { DEMO_CREDENTIALS } from "@/db/seed/demo";
import { generateTotpCode } from "@/lib/auth/totp";
import { E2E_CONTEXT_PATH } from "./global-setup";

export { DEMO_CREDENTIALS };

export function readE2eContext(): { toolSlug: string } {
  return JSON.parse(readFileSync(E2E_CONTEXT_PATH, "utf-8"));
}

/** §28: admin demo accounts have MFA pre-enabled (see db/seed/demo.ts's DEMO_MFA_SECRET), so
 * logging in as one always shows the second-factor step. This computes a real, currently
 * valid TOTP code from that known secret — same primitive a real authenticator app uses —
 * rather than needing a special test-only bypass. */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  // Race rather than a fixed wait: a non-MFA account reaches /dashboard almost immediately,
  // and waiting a fixed few seconds "just in case" on every such login would slow down most
  // of the suite for no reason.
  const mfaInput = page.getByLabel(/código de tu aplicación de autenticación/i);
  const outcome = await Promise.race([
    page.waitForURL(/\/dashboard/).then(() => "dashboard" as const),
    mfaInput.waitFor({ state: "visible" }).then(() => "mfa" as const),
  ]);

  if (outcome === "mfa") {
    const account = Object.values(DEMO_CREDENTIALS).find((c) => c.email === email) as { mfaSecret?: string } | undefined;
    if (!account?.mfaSecret) throw new Error(`No hay secreto MFA conocido para ${email}.`);
    await mfaInput.fill(generateTotpCode(account.mfaSecret));
    await page.getByRole("button", { name: /verificar/i }).click();
    await page.waitForURL(/\/dashboard/);
  }
}
