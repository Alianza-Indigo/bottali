// Side-effect-only module: populates process.env for standalone scripts run via tsx
// (outside of Next.js, which loads .env.local automatically on its own).
// Import this as the FIRST import in any script that touches lib/env.ts or lib/db/client.ts
// — ES module side effects execute in import declaration order, so this must resolve
// before anything that reads process.env at module top-level.
import { config } from "dotenv";

config({ path: ".env.local" });
config();
