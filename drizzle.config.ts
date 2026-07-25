import type { Config } from "drizzle-kit";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

export default {
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/crisis_platform",
  },
  strict: true,
  verbose: true,
} satisfies Config;
