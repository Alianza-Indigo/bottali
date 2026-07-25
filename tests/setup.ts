import { config } from "dotenv";

config({ path: ".env.local" });
config();

// NODE_ENV is already "test" here (Vitest sets it, and @types/node marks it read-only).
// Our own APP_ENV enum has no "test" member — "development" is the closest semantic match
// and keeps lib/env.ts validation happy.
process.env.APP_ENV = process.env.APP_ENV ?? "development";
