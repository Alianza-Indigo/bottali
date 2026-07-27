import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { DEMO_CREDENTIALS } from "@/db/seed/demo";
import { generateTotpCode } from "@/lib/auth/totp";
import { E2E_CONTEXT_PATH } from "./global-setup";

export { DEMO_CREDENTIALS };

export function readE2eContext(): { toolSlug: string } {
  return JSON.parse(readFileSync(E2E_CONTEXT_PATH, "utf-8"));
}

/** Uses the transitional password endpoint to prepare authenticated browser state without
 * exposing password login in the product UI. Admin demo accounts still complete MFA through
 * the same screen and endpoint used after Google authentication. */
export async function loginAs(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/v1/auth/login", {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`No fue posible iniciar sesión como ${email}: ${response.status()}`);
  }
  const result = (await response.json()) as { mfaRequired?: boolean };

  if (result.mfaRequired) {
    const account = Object.values(DEMO_CREDENTIALS).find((c) => c.email === email) as { mfaSecret?: string } | undefined;
    if (!account?.mfaSecret) throw new Error(`No hay secreto MFA conocido para ${email}.`);
    await page.goto("/login/mfa");
    const mfaInput = page.getByLabel(/código de autenticación/i);
    await mfaInput.fill(generateTotpCode(account.mfaSecret));
    await page.getByRole("button", { name: /verificar/i }).click();
    await page.waitForURL(/\/dashboard/);
    return;
  }

  await page.goto("/dashboard");
}
