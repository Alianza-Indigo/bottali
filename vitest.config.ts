import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
    // Makes `import "server-only"` resolve to its no-op export (as Next.js's server
    // bundler does) instead of the throwing default export, which assumes a bundler
    // condition that plain Node/Vitest doesn't set otherwise.
    conditions: ["react-server"],
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
