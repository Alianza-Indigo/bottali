import "./scripts/load-env";
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "accessibility/**/*.spec.ts", "security/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    // Always start a fresh server, never reuse whatever already answers on the port. A stale
    // "next start" process left over from an earlier, differently-hashed build (e.g. an
    // interrupted local run) can otherwise sit on this port and silently serve mismatched HTML
    // against the current .next build, producing intermittent, hard-to-diagnose chunk 400s.
    reuseExistingServer: false,
    timeout: 60_000,
    // NODE_OPTIONS=--conditions=react-server (needed by global-setup.ts to import server-only
    // library code outside Next's own bundler) must NOT leak into the actual Next.js server
    // process — Next already resolves "server-only" correctly on its own, and inheriting this
    // flag here subtly breaks the production server's module resolution.
    env: { ...process.env, PORT: String(PORT), NODE_OPTIONS: "" },
  },
});
