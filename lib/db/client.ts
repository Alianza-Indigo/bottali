import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "@/db/schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const env = getEnv();
  const url = env.DATABASE_POOL_URL || env.DATABASE_URL;
  return postgres(url, {
    max: env.APP_ENV === "production" ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

// Reused across invocations within the same warm serverless instance / dev process.
// NOTE: standalone scripts (scripts/migrate.ts, scripts/seed.ts, ...) must import
// "./load-env" (or otherwise populate process.env) as their FIRST import, before this
// module is imported anywhere in their graph — module side effects run in import
// declaration order, so this file's top-level getEnv() call must not run first.
const client = globalThis.__dbClient ?? createClient();
if (getEnv().APP_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;

/** A transaction callback's `tx` parameter — lacks `$client` and other top-level-only
 * members, so functions accepting "either the db handle or an in-flight transaction"
 * (any repository function called both standalone and from inside db.transaction(...))
 * should type their executor param as `DbOrTx`, not `Database`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;
