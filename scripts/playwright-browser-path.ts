import { existsSync } from "node:fs";

const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";

/**
 * This repo's dev sandbox ships a pre-installed Chromium at a fixed path (faster, no
 * download). Real environments (GitHub Actions, a contributor's machine) don't have it —
 * there, `npx playwright install chromium` puts the browser wherever Playwright's own
 * resolution expects it, so `executablePath` must be left undefined and let Playwright
 * find it. Returning undefined here is what makes both environments work unmodified.
 */
export function resolvePlaywrightExecutablePath(): string | undefined {
  return existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined;
}
