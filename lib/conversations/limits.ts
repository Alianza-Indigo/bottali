import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, costEvents, messages, toolModels, usageEvents, usageReservations } from "@/db/schema";
import { BudgetExceededError, RateLimitError } from "@/lib/utils/errors";

function startOfDayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface ReserveUsageInput {
  userId: string;
  toolId: string;
  toolVersionId: string;
  conversationId: string;
  idempotencyKey: string;
  estimatedCostCents: number;
}

/**
 * §23/§12 step 6: verifies per-user daily message / monthly token / monthly budget limits
 * and books an estimated-cost reservation, all inside one transaction serialized with a
 * Postgres advisory lock keyed by (user, tool) — this is what prevents two concurrent
 * requests from both passing the check and jointly exceeding the limit.
 */
export async function reserveUsage(input: ReserveUsageInput): Promise<{ reservationId: string }> {
  return db.transaction(async (tx) => {
    const lockKey = `${input.userId}:${input.toolId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const modelRows = await tx.select().from(toolModels).where(eq(toolModels.toolVersionId, input.toolVersionId)).limit(1);
    const model = modelRows[0];
    if (!model) throw new Error("La herramienta no tiene configuración de modelo.");

    const today = startOfDayUtc();
    const monthStart = startOfMonthUtc();

    const messagesTodayRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.userId, input.userId),
          eq(conversations.toolId, input.toolId),
          eq(messages.role, "user"),
          gte(messages.createdAt, today),
        ),
      );
    const messagesToday = messagesTodayRows[0]?.count ?? 0;
    if (messagesToday >= model.perUserDailyMessageLimit) {
      throw new RateLimitError("Se alcanzó el límite diario de mensajes para esta herramienta.");
    }

    const monthlyTokensRows = await tx
      .select({ tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int` })
      .from(usageEvents)
      .where(and(eq(usageEvents.userId, input.userId), eq(usageEvents.toolId, input.toolId), gte(usageEvents.createdAt, monthStart)));
    const monthlyTokens = monthlyTokensRows[0]?.tokens ?? 0;
    if (monthlyTokens >= model.perUserMonthlyTokenLimit) {
      throw new RateLimitError("Se alcanzó el límite mensual de tokens para esta herramienta.");
    }

    const spentRows = await tx
      .select({ spentCents: sql<number>`coalesce(sum(${costEvents.amountCents}), 0)::numeric` })
      .from(costEvents)
      .where(and(eq(costEvents.toolId, input.toolId), gte(costEvents.createdAt, monthStart)));
    const projectedSpend = Number(spentRows[0]?.spentCents ?? 0) + input.estimatedCostCents;
    if (projectedSpend > model.budgetMonthlyCents) {
      throw new BudgetExceededError("Se alcanzó el presupuesto mensual configurado para esta herramienta.");
    }

    const existing = await tx
      .select({ id: usageReservations.id })
      .from(usageReservations)
      .where(eq(usageReservations.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0]) return { reservationId: existing[0].id };

    const [reservation] = await tx
      .insert(usageReservations)
      .values({
        userId: input.userId,
        toolId: input.toolId,
        conversationId: input.conversationId,
        idempotencyKey: input.idempotencyKey,
        estimatedCostCents: String(input.estimatedCostCents),
        status: "HELD",
      })
      .returning({ id: usageReservations.id });
    if (!reservation) throw new Error("No fue posible reservar el consumo estimado.");
    return { reservationId: reservation.id };
  });
}

export interface ReconcileUsageInput {
  reservationId: string;
  userId: string;
  toolId: string;
  conversationId: string;
  messageId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export async function reconcileUsage(input: ReconcileUsageInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(usageReservations)
      .set({ status: "RECONCILED", reconciledCostCents: String(input.costCents), resolvedAt: new Date() })
      .where(eq(usageReservations.id, input.reservationId));

    await tx.insert(usageEvents).values({
      userId: input.userId,
      toolId: input.toolId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      kind: "message",
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costCents: String(input.costCents),
    });

    await tx.insert(costEvents).values({
      toolId: input.toolId,
      userId: input.userId,
      source: "message",
      amountCents: String(input.costCents),
      metadata: { messageId: input.messageId },
    });
  });
}

export async function releaseReservation(reservationId: string): Promise<void> {
  await db
    .update(usageReservations)
    .set({ status: "RELEASED", resolvedAt: new Date() })
    .where(eq(usageReservations.id, reservationId));
}
