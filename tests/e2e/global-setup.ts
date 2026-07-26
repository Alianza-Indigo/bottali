import "../../scripts/load-env";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { seedRolesAndPermissions } from "@/lib/permissions/seed-rbac";
import { syncProvidersFromEnv } from "@/lib/ai/sync-providers";
import { seedDefaultLegalDocuments } from "@/lib/legal/seed-legal";
import { seedDemoData, DEMO_CREDENTIALS } from "@/db/seed/demo";
import { createPublishedTestTool } from "../fixtures/tool-factory";

export const E2E_CONTEXT_PATH = path.join(__dirname, ".e2e-context.json");

/** Seeds everything the e2e suite depends on against the real dev Postgres: RBAC catalog,
 * fake AI provider, demo users (already email-verified, so login works without an inbox),
 * and one published tool the demo "user" account can open and chat with. Idempotent — safe
 * to run before every test run. */
async function globalSetup() {
  await seedRolesAndPermissions(db);
  await syncProvidersFromEnv(db);
  await seedDefaultLegalDocuments(db);
  await seedDemoData(db);

  const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
  if (!demoUser) throw new Error("No fue posible localizar/crear el usuario demo para e2e.");

  const { slug: toolSlug } = await createPublishedTestTool(demoUser.id, { pwa: true, voice: true });

  writeFileSync(E2E_CONTEXT_PATH, JSON.stringify({ toolSlug }, null, 2));
}

export default globalSetup;
