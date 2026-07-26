import "./scripts/load-env";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightExecutablePath } from "./scripts/playwright-browser-path";

// Separate from playwright.config.ts deliberately: performance thresholds are inherently
// looser/more environment-sensitive than functional assertions, and a slow perf run
// shouldn't gate the main e2e/accessibility/security suite (npm run test:e2e) or vice versa.
const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3101;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/performance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    launchOptions: { executablePath: resolvePlaywrightExecutablePath() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, PORT: String(PORT), NODE_OPTIONS: "" },
  },
});
