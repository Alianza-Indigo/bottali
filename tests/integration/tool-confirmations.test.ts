import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { toolCallConfirmations, tools, usageReservations, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation, getConversationWithMessages } from "@/lib/conversations/service";
import { resumeAfterToolConfirmation, sendMessage } from "@/lib/conversations/pipeline";
import type { StreamEvent } from "@/lib/conversations/pipeline";
import { expireStalePendingConfirmations } from "@/lib/conversations/tool-confirmations";
import { createPublishedTestTool } from "../fixtures/tool-factory";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/**
 * §15 human-in-the-loop: exercises the real pause -> approve/reject -> resume cycle through
 * the actual pipeline (sendMessage + resumeAfterToolConfirmation), not just the isolated
 * helper functions — a tool marked confirmationsRequired must never auto-execute, and the
 * turn must be resumable exactly where it paused, potentially in a completely separate
 * request (simulated here by calling resumeAfterToolConfirmation independently).
 */
describe("tool-call confirmation cycle (real Postgres, fake LLM provider)", () => {
  let actorId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `tool-confirm-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;
  });

  afterAll(async () => {
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  async function setUpConversation() {
    const { toolId } = await createPublishedTestTool(actorId, {
      internalTools: ["calculator"],
      confirmationsRequired: ["calculator"],
    });
    await activateToolForUser(toolId, actorId);
    const toolRows = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, toolRows[0]!.publishedVersionId!);
    return { toolId, conversation };
  }

  it("pauses generation instead of auto-executing a tool that requires confirmation", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const events = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("confirmation_required");
    const confirmationEvent = events[0] as Extract<StreamEvent, { type: "confirmation_required" }>;
    expect(confirmationEvent.toolName).toBe("calculator");

    const pendingRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationEvent.confirmationId)).limit(1);
    const pending = pendingRows[0]!;
    expect(pending.status).toBe("PENDING");
    expect(pending.toolName).toBe("calculator");
    expect(JSON.parse(pending.argumentsJson)).toEqual({ expression: "6*7" });

    // Generation genuinely paused: no assistant message yet, and the budget reservation is
    // still HELD (not reconciled/released) — this is what makes it resumable.
    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("user");

    const reservationRows = await db.select().from(usageReservations).where(eq(usageReservations.id, pending.reservationId)).limit(1);
    expect(reservationRows[0]!.status).toBe("HELD");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("approving resumes generation, actually executes the tool, and finalizes the message", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const pauseEvents = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );
    const confirmationId = (pauseEvents[0] as Extract<StreamEvent, { type: "confirmation_required" }>).confirmationId;

    const resumeEvents = await collect(
      resumeAfterToolConfirmation({ confirmationId, userId: actorId, decision: "approve", signal: controller.signal }),
    );
    expect(resumeEvents.some((e) => e.type === "error")).toBe(false);
    expect(resumeEvents.find((e) => e.type === "done")).toBeTruthy();

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    expect(msgs).toHaveLength(2);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    expect(assistantMessage.status).toBe("COMPLETED");
    // The calculator actually ran (6*7=42) — this only appears if approval genuinely
    // triggered real execution, not a no-op.
    expect(assistantMessage.content).toContain("42");

    const confirmationRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationId)).limit(1);
    expect(confirmationRows[0]!.status).toBe("APPROVED");

    const reservationRows = await db.select().from(usageReservations).where(eq(usageReservations.id, confirmationRows[0]!.reservationId)).limit(1);
    expect(reservationRows[0]!.status).toBe("RECONCILED");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("rejecting tells the model the user declined and lets the turn finish gracefully", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const pauseEvents = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );
    const confirmationId = (pauseEvents[0] as Extract<StreamEvent, { type: "confirmation_required" }>).confirmationId;

    const resumeEvents = await collect(
      resumeAfterToolConfirmation({ confirmationId, userId: actorId, decision: "reject", signal: controller.signal }),
    );
    expect(resumeEvents.some((e) => e.type === "error")).toBe(false);
    expect(resumeEvents.find((e) => e.type === "done")).toBeTruthy();

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    expect(assistantMessage.status).toBe("COMPLETED");
    expect(assistantMessage.content).not.toContain("42");
    expect(assistantMessage.content).toContain("rechazó");

    const confirmationRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationId)).limit(1);
    expect(confirmationRows[0]!.status).toBe("REJECTED");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("an expired confirmation cannot be resumed and releases its reservation", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const pauseEvents = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );
    const confirmationId = (pauseEvents[0] as Extract<StreamEvent, { type: "confirmation_required" }>).confirmationId;

    await db.update(toolCallConfirmations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(toolCallConfirmations.id, confirmationId));

    await expect(
      collect(resumeAfterToolConfirmation({ confirmationId, userId: actorId, decision: "approve", signal: controller.signal })),
    ).rejects.toThrow(/expiró/);

    const confirmationRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationId)).limit(1);
    expect(confirmationRows[0]!.status).toBe("EXPIRED");
    const reservationRows = await db.select().from(usageReservations).where(eq(usageReservations.id, confirmationRows[0]!.reservationId)).limit(1);
    expect(reservationRows[0]!.status).toBe("RELEASED");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("the cron sweep expires stale pending confirmations and releases their reservations", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const pauseEvents = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"1+1"}',
        signal: controller.signal,
      }),
    );
    const confirmationId = (pauseEvents[0] as Extract<StreamEvent, { type: "confirmation_required" }>).confirmationId;
    await db.update(toolCallConfirmations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(toolCallConfirmations.id, confirmationId));

    const { expired } = await expireStalePendingConfirmations();
    expect(expired).toBeGreaterThan(0);

    const confirmationRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationId)).limit(1);
    expect(confirmationRows[0]!.status).toBe("EXPIRED");
    const reservationRows = await db.select().from(usageReservations).where(eq(usageReservations.id, confirmationRows[0]!.reservationId)).limit(1);
    expect(reservationRows[0]!.status).toBe("RELEASED");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("sending a new message expires a stale pending confirmation on the same conversation (flexible, non-blocking)", async () => {
    const { toolId, conversation } = await setUpConversation();
    const controller = new AbortController();

    const pauseEvents = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"2+2"}',
        signal: controller.signal,
      }),
    );
    const confirmationId = (pauseEvents[0] as Extract<StreamEvent, { type: "confirmation_required" }>).confirmationId;

    // The user doesn't wait — they just send another message, which must be allowed to
    // proceed normally rather than being blocked by the earlier pending confirmation.
    const secondEvents = await collect(
      sendMessage({ conversationId: conversation.id, userId: actorId, content: "Olvídalo, cuéntame un chiste.", signal: controller.signal }),
    );
    expect(secondEvents.some((e) => e.type === "error")).toBe(false);
    expect(secondEvents.find((e) => e.type === "done")).toBeTruthy();

    const confirmationRows = await db.select().from(toolCallConfirmations).where(eq(toolCallConfirmations.id, confirmationId)).limit(1);
    expect(confirmationRows[0]!.status).toBe("EXPIRED");
    const reservationRows = await db.select().from(usageReservations).where(eq(usageReservations.id, confirmationRows[0]!.reservationId)).limit(1);
    expect(reservationRows[0]!.status).toBe("RELEASED");

    await db.delete(tools).where(eq(tools.id, toolId));
  });
});
