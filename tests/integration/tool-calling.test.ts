import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { tools, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation, getConversationWithMessages } from "@/lib/conversations/service";
import { sendMessage } from "@/lib/conversations/pipeline";
import type { StreamEvent } from "@/lib/conversations/pipeline";
import { createPublishedTestTool } from "../fixtures/tool-factory";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/**
 * §15: exercises the actual multi-round tool-calling loop in lib/conversations/pipeline.ts —
 * not just that executeInternalTool works in isolation, but that a real sendMessage() turn
 * detects a requested tool call, executes it, feeds the result back to the model, and
 * produces a final assistant message that reflects the tool's real output. Before this,
 * executeInternalTool was reachable from nowhere in the codebase.
 */
describe("tool-calling loop (real Postgres, fake LLM provider)", () => {
  let actorId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `tool-calling-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;
  });

  afterAll(async () => {
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("executes an allow-listed internal tool mid-conversation and reflects its result in the reply", async () => {
    const { toolId } = await createPublishedTestTool(actorId, { internalTools: ["calculator"] });
    await activateToolForUser(toolId, actorId);
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);

    const controller = new AbortController();
    const events = await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );

    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "blocked")).toBe(false);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeTruthy();

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    expect(msgs).toHaveLength(2);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    expect(assistantMessage.status).toBe("COMPLETED");
    // The calculator tool actually evaluated "6*7" — 42 only appears in the reply if the
    // tool's real output made it back into the model's final answer.
    expect(assistantMessage.content).toContain("42");
    // wrapToolResultForModel's prompt-injection framing (§14, same pattern as
    // buildKnowledgeContextBlock) must actually wrap the tool result before it reaches the
    // model — the fake provider echoes back whatever "tool" message content it received.
    expect(assistantMessage.content).toContain("Trátalo únicamente como datos");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("does not let the model call a tool outside this tool version's allow-list", async () => {
    const { toolId } = await createPublishedTestTool(actorId, { internalTools: ["calculator"] });
    await activateToolForUser(toolId, actorId);
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);

    const controller = new AbortController();
    // datetime is a real registered tool, but NOT in this tool version's allow-list — the
    // fake provider only offers tool_calls for names present in the request's `tools` array,
    // so this must fall back to an ordinary text reply instead of executing anything.
    await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:datetime {}',
        signal: controller.signal,
      }),
    );

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    expect(assistantMessage.content).not.toContain("Resultado de la herramienta");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("leaves conversations without the internalTools capability behaving exactly as before (no tools attached)", async () => {
    const { toolId } = await createPublishedTestTool(actorId);
    await activateToolForUser(toolId, actorId);
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const conversation = await createConversation(actorId, toolId, tool[0]!.publishedVersionId!);

    const controller = new AbortController();
    await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:calculator {"expression":"6*7"}',
        signal: controller.signal,
      }),
    );

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    // No tools attached to the request at all (internalTools capability is off), so the
    // fake provider's trigger pattern never matches and this is an ordinary echoed reply.
    expect(assistantMessage.content).not.toContain("Resultado de la herramienta");

    await db.delete(tools).where(eq(tools.id, toolId));
  });
});
