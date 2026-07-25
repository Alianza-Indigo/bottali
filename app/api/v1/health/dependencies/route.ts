import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { requirePermission } from "@/lib/permissions/rbac";
import { getLLMProvider, getEmbeddingProvider, getModerationProvider } from "@/lib/ai/registry";
import { getRateLimiter } from "@/lib/security/rate-limit";
import { getEnv } from "@/lib/env";
import { handleApiError } from "@/lib/validation/http";

// Admin-only: this is the one health endpoint allowed to describe *which* dependencies
// are configured (never their secrets), per spec §35 ("restringido a administradores").
export async function GET() {
  try {
    const user = await requireCurrentUser();
    await requirePermission(user.id, "security.read");

    const env = getEnv();
    const started = Date.now();

    const [database, llm, embedding, moderation] = await Promise.allSettled([
      db.execute(sql`select 1`).then(() => ({ healthy: true })),
      getLLMProvider().healthcheck(),
      getEmbeddingProvider().healthcheck(),
      getModerationProvider().healthcheck(),
    ]);

    let redis: { healthy: boolean; message?: string } = { healthy: false, message: "No configurado (usando fallback en memoria)" };
    if (env.REDIS_URL && env.REDIS_TOKEN) {
      try {
        await getRateLimiter().consume("healthcheck", 1_000_000, 60);
        redis = { healthy: true };
      } catch (error) {
        redis = { healthy: false, message: error instanceof Error ? error.message : "Error desconocido" };
      }
    }

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      dependencies: {
        database: database.status === "fulfilled" ? database.value : { healthy: false },
        redis,
        llm: llm.status === "fulfilled" ? llm.value : { healthy: false },
        embedding: embedding.status === "fulfilled" ? embedding.value : { healthy: false },
        moderation: moderation.status === "fulfilled" ? moderation.value : { healthy: false },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
