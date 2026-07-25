import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { DEMO_CREDENTIALS } from "@/db/seed/demo";
import { E2E_CONTEXT_PATH } from "./global-setup";

export { DEMO_CREDENTIALS };

export function readE2eContext(): { toolSlug: string } {
  return JSON.parse(readFileSync(E2E_CONTEXT_PATH, "utf-8"));
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/dashboard/);
}
