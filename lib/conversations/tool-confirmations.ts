import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolCallConfirmations } from "@/db/schema";
import { releaseReservation } from "./limits";

/** How long a human has to approve/reject a pending tool call before it auto-expires and
 * releases its budget reservation. Kept as a single constant (not per-tool/per-version
 * configurable yet) — flexible enough to change in one place if a real deployment needs a
 * different window, without a schema change (expiresAt is computed at creation time). */
const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export function computeConfirmationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CONFIRMATION_TTL_MS);
}

export async function expireSingleConfirmation(id: string, reservationId: string): Promise<void> {
  await db
    .update(toolCallConfirmations)
    .set({ status: "EXPIRED", resolvedAt: new Date() })
    .where(and(eq(toolCallConfirmations.id, id), eq(toolCallConfirmations.status, "PENDING")));
  await releaseReservation(reservationId);
}

/** Called by the retention cron (§36): sweeps every PENDING confirmation whose expiresAt
 * has passed, marking it EXPIRED and releasing its held reservation so budget isn't stuck
 * forever behind a human who never responded. */
export async function expireStalePendingConfirmations(): Promise<{ expired: number }> {
  const stale = await db
    .select({ id: toolCallConfirmations.id, reservationId: toolCallConfirmations.reservationId })
    .from(toolCallConfirmations)
    .where(and(eq(toolCallConfirmations.status, "PENDING"), lt(toolCallConfirmations.expiresAt, new Date())))
    .limit(200);

  for (const row of stale) {
    await expireSingleConfirmation(row.id, row.reservationId);
  }
  return { expired: stale.length };
}

/**
 * Flexible-by-design: a pending confirmation never blocks the rest of the conversation —
 * the user can keep chatting. But an old pending call left behind by a new message is no
 * longer relevant to resume (the conversation moved on), so it's expired proactively rather
 * than left to linger until the cron sweep, and its reservation is released immediately
 * instead of held for up to CONFIRMATION_TTL_MS for no reason.
 */
export async function expirePendingConfirmationsForConversation(conversationId: string): Promise<void> {
  const pending = await db
    .select({ id: toolCallConfirmations.id, reservationId: toolCallConfirmations.reservationId })
    .from(toolCallConfirmations)
    .where(and(eq(toolCallConfirmations.conversationId, conversationId), eq(toolCallConfirmations.status, "PENDING")));

  for (const row of pending) {
    await expireSingleConfirmation(row.id, row.reservationId);
  }
}

export async function getPendingConfirmation(conversationId: string) {
  const rows = await db
    .select({
      id: toolCallConfirmations.id,
      toolName: toolCallConfirmations.toolName,
      argumentsJson: toolCallConfirmations.argumentsJson,
      createdAt: toolCallConfirmations.createdAt,
      expiresAt: toolCallConfirmations.expiresAt,
    })
    .from(toolCallConfirmations)
    .where(and(eq(toolCallConfirmations.conversationId, conversationId), eq(toolCallConfirmations.status, "PENDING")))
    .limit(1);
  return rows[0] ?? null;
}
