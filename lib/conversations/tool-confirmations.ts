import { and, eq, gt, lt } from "drizzle-orm";
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

type ToolCallConfirmationRow = typeof toolCallConfirmations.$inferSelect;

/**
 * Atomically claims a PENDING confirmation for approval, transitioning it to EXECUTING in
 * the same statement that checks it's still claimable (WHERE status='PENDING' AND not
 * expired). Two concurrent approve requests can both pass a plain SELECT-then-check, but
 * only one UPDATE...WHERE...RETURNING can actually flip the row — the loser gets an empty
 * result instead of also executing the tool. Returns null if it wasn't claimable (already
 * resolved, expired, wrong user, or doesn't exist) — callers distinguish why via a
 * read-only follow-up, since that no longer affects correctness once the claim itself is
 * atomic.
 */
export async function claimConfirmationForExecution(id: string, userId: string): Promise<ToolCallConfirmationRow | null> {
  const rows = await db
    .update(toolCallConfirmations)
    .set({ status: "EXECUTING" })
    .where(
      and(
        eq(toolCallConfirmations.id, id),
        eq(toolCallConfirmations.userId, userId),
        eq(toolCallConfirmations.status, "PENDING"),
        gt(toolCallConfirmations.expiresAt, new Date()),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Same atomic-claim guarantee as claimConfirmationForExecution, but for rejection: since
 * there's nothing to execute, the claim IS the final state — REJECTED directly, no
 * intermediate EXECUTING needed. */
export async function claimConfirmationForRejection(id: string, userId: string): Promise<ToolCallConfirmationRow | null> {
  const rows = await db
    .update(toolCallConfirmations)
    .set({ status: "REJECTED", resolvedAt: new Date() })
    .where(
      and(
        eq(toolCallConfirmations.id, id),
        eq(toolCallConfirmations.userId, userId),
        eq(toolCallConfirmations.status, "PENDING"),
        gt(toolCallConfirmations.expiresAt, new Date()),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/** Finalizes an EXECUTING confirmation as APPROVED once its tool has actually run. Safe to
 * call unconditionally — only the request holding the EXECUTING claim ever reaches here. */
export async function markConfirmationApproved(id: string): Promise<void> {
  await db.update(toolCallConfirmations).set({ status: "APPROVED", resolvedAt: new Date() }).where(eq(toolCallConfirmations.id, id));
}

/** Reads the current row purely to explain WHY a claim failed (not found / wrong owner /
 * already resolved / expired) — the claim itself already resolved the actual race
 * atomically, so this is diagnostic only and never the source of truth for state. */
export async function getConfirmationById(id: string): Promise<ToolCallConfirmationRow | null> {
  const rows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Expires exactly one PENDING confirmation, atomically (WHERE status='PENDING'), and only
 * releases its reservation if that transition actually happened here — a concurrent
 * approve/reject that already moved it out of PENDING must NOT have its (possibly already
 * reconciled) reservation clobbered by a stale expiry racing behind it.
 */
export async function expireSingleConfirmation(id: string, reservationId: string): Promise<void> {
  const rows = await db
    .update(toolCallConfirmations)
    .set({ status: "EXPIRED", resolvedAt: new Date() })
    .where(and(eq(toolCallConfirmations.id, id), eq(toolCallConfirmations.status, "PENDING")))
    .returning({ id: toolCallConfirmations.id });
  if (rows.length > 0) {
    await releaseReservation(reservationId);
  }
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
