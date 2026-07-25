import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providers, sessions } from "@/db/schema";
import { registerJobHandler } from "../registry";
import { processScheduledPublications } from "@/lib/tools/service";
import { getEmbeddingProvider, getLLMProvider, getModerationProvider } from "@/lib/ai/registry";

registerJobHandler("process_scheduled_publications", async () => {
  const result = await processScheduledPublications();
  return { published: result.published };
});

registerJobHandler("revoke_expired_sessions", async () => {
  const result = await db
    .update(sessions)
    .set({ status: "EXPIRED" })
    .where(and(eq(sessions.status, "ACTIVE"), lt(sessions.expiresAt, new Date())))
    .returning({ id: sessions.id });
  return { revoked: result.length };
});

registerJobHandler("provider_health_check", async () => {
  const checks = await Promise.allSettled([
    getLLMProvider().healthcheck(),
    getEmbeddingProvider().healthcheck(),
    getModerationProvider().healthcheck(),
  ]);

  const kinds = ["llm", "embedding", "moderation"] as const;
  let updated = 0;
  for (let i = 0; i < kinds.length; i++) {
    const check = checks[i];
    if (check?.status !== "fulfilled") continue;
    const health = check.value;
    const rows = await db.select({ id: providers.id, key: providers.key }).from(providers).where(eq(providers.kind, kinds[i]!));
    for (const row of rows) {
      await db
        .update(providers)
        .set({ lastHealthcheckAt: new Date(), lastHealthcheckStatus: health.healthy ? "healthy" : "unhealthy", updatedAt: new Date() })
        .where(eq(providers.id, row.id));
      updated += 1;
    }
  }
  return { updated };
});
