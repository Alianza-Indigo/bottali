import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { messageFeedback, messages, tools, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation, getConversationWithMessages, archiveConversation, restoreConversation, deleteConversation } from "@/lib/conversations/service";
import { regenerateResponse, sendMessage } from "@/lib/conversations/pipeline";
import type { StreamEvent } from "@/lib/conversations/pipeline";
import { reserveUsage } from "@/lib/conversations/limits";
import { createPublishedTestTool } from "../fixtures/tool-factory";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("conversation pipeline (real Postgres, fake LLM + moderation provider)", () => {
  let actorId: string;
  let toolId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `conv-pipeline-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;

    const result = await createPublishedTestTool(actorId);
    toolId = result.toolId;
    await activateToolForUser(toolId, actorId);
  });

  afterAll(async () => {
    if (toolId) await db.delete(tools).where(eq(tools.id, toolId));
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("sends a message, streams deltas, and persists both messages", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);

    const controller = new AbortController();
    const events = await collect(
      sendMessage({ conversationId: conversation.id, userId: actorId, content: "Hola, ¿qué puedes hacer?", signal: controller.signal }),
    );

    const deltas = events.filter((e) => e.type === "delta");
    const done = events.find((e) => e.type === "done");
    expect(deltas.length).toBeGreaterThan(0);
    expect(done).toBeTruthy();

    const { conversation: reloaded, messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    expect(reloaded.title).not.toBe("Nueva conversación");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("user");
    expect(msgs[1]!.role).toBe("assistant");
    expect(msgs[1]!.status).toBe("COMPLETED");
    expect(msgs[1]!.inputTokens).toBeGreaterThan(0);
  });

  it("reserveUsage is idempotent: the same key returns the same reservation instead of double-booking", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);
    const idempotencyKey = `message-generation:${randomUUID()}`;

    const first = await reserveUsage({
      userId: actorId,
      toolId,
      toolVersionId: conversation.toolVersionId,
      conversationId: conversation.id,
      idempotencyKey,
      estimatedCostCents: 10,
    });
    const second = await reserveUsage({
      userId: actorId,
      toolId,
      toolVersionId: conversation.toolVersionId,
      conversationId: conversation.id,
      idempotencyKey,
      estimatedCostCents: 10,
    });

    // A retry with the SAME key must reuse the original reservation rather than booking twice —
    // this is exactly the property a random idempotencyKey (msg:id:randomUUID()) used to break.
    expect(second.reservationId).toBe(first.reservationId);

    const third = await reserveUsage({
      userId: actorId,
      toolId,
      toolVersionId: conversation.toolVersionId,
      conversationId: conversation.id,
      idempotencyKey: `message-generation:${randomUUID()}`,
      estimatedCostCents: 10,
    });
    expect(third.reservationId).not.toBe(first.reservationId);
  });

  it("blocks a message flagged by input moderation without calling the model", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);
    const controller = new AbortController();

    const events = await collect(
      sendMessage({ conversationId: conversation.id, userId: actorId, content: "Quiero información sobre una bomba", signal: controller.signal }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("blocked");

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.status).toBe("BLOCKED");
  });

  it("stops streaming when the client aborts", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);
    const controller = new AbortController();

    const events: StreamEvent[] = [];
    let index = 0;
    for await (const event of sendMessage({ conversationId: conversation.id, userId: actorId, content: "Cuéntame algo largo", signal: controller.signal })) {
      events.push(event);
      index += 1;
      if (index === 1) controller.abort();
    }

    const done = events.find((e) => e.type === "done");
    expect(done && "finishReason" in done ? done.finishReason : undefined).toBe("cancelled");

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant");
    expect(assistantMessage?.status).toBe("CANCELLED");
  });

  it("regenerates a response and leaves the original message in history", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);
    const controller = new AbortController();

    await collect(sendMessage({ conversationId: conversation.id, userId: actorId, content: "Primera pregunta", signal: controller.signal }));
    const before = await getConversationWithMessages(conversation.id, actorId);
    const originalAssistantMessage = before.messages.find((m) => m.role === "assistant")!;

    const regenController = new AbortController();
    const regenEvents = await collect(regenerateResponse({ assistantMessageId: originalAssistantMessage.id, userId: actorId, signal: regenController.signal }));
    expect(regenEvents.some((e) => e.type === "done")).toBe(true);

    const after = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessages = after.messages.filter((m) => m.role === "assistant");
    expect(assistantMessages.length).toBe(2);
    expect(assistantMessages.some((m) => m.id === originalAssistantMessage.id)).toBe(true);
  });

  it("accepts feedback on a message", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);
    const controller = new AbortController();
    await collect(sendMessage({ conversationId: conversation.id, userId: actorId, content: "Hola", signal: controller.signal }));

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;

    await db.insert(messageFeedback).values({ messageId: assistantMessage.id, userId: actorId, rating: "up" });
    const feedbackRows = await db.select().from(messageFeedback).where(eq(messageFeedback.messageId, assistantMessage.id));
    expect(feedbackRows).toHaveLength(1);
  });

  it("archives, restores and deletes a conversation", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);

    await archiveConversation(conversation.id, actorId);
    const rows = await db.select().from(messages).where(eq(messages.conversationId, conversation.id));
    expect(rows).toHaveLength(0); // no messages yet, just verifying archive doesn't throw

    await restoreConversation(conversation.id, actorId);
    await deleteConversation(conversation.id, actorId);

    const { conversation: deletedConversation } = await import("@/db/schema").then((schema) =>
      db.select().from(schema.conversations).where(eq(schema.conversations.id, conversation.id)).limit(1).then((r) => ({ conversation: r[0]! })),
    );
    expect(deletedConversation.status).toBe("DELETED");
    expect(deletedConversation.deletedAt).toBeTruthy();
  });
});
