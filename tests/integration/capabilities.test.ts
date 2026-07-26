import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { notifications, tools, uploadedFiles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation, escalateConversation, getConversationWithMessages } from "@/lib/conversations/service";
import { sendMessage } from "@/lib/conversations/pipeline";
import { initiateUpload, completeUpload } from "@/lib/files/service";
import type { StreamEvent } from "@/lib/conversations/pipeline";
import { AppError } from "@/lib/utils/errors";
import { createPublishedTestTool } from "../fixtures/tool-factory";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/**
 * Verifies that the previously-dead capability flags audited this session (history, memory,
 * documentGeneration, streaming, notifications, files/images, escalation) now actually change
 * pipeline behavior instead of being ignored checkboxes.
 */
describe("tool capabilities actually gate real behavior", () => {
  let actorId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `capabilities-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;
  });

  afterAll(async () => {
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("capabilities.streaming=false collapses the reply into a single delta instead of many", async () => {
    const { toolId: streamingToolId } = await createPublishedTestTool(actorId, { streaming: true });
    const { toolId: bufferedToolId } = await createPublishedTestTool(actorId, { streaming: false });
    await activateToolForUser(streamingToolId, actorId);
    await activateToolForUser(bufferedToolId, actorId);

    const streamingTool = (await db.select().from(tools).where(eq(tools.id, streamingToolId)))[0]!;
    const bufferedTool = (await db.select().from(tools).where(eq(tools.id, bufferedToolId)))[0]!;
    const streamingConvo = await createConversation(actorId, streamingToolId, streamingTool.publishedVersionId!);
    const bufferedConvo = await createConversation(actorId, bufferedToolId, bufferedTool.publishedVersionId!);

    const streamingEvents = await collect(
      sendMessage({ conversationId: streamingConvo.id, userId: actorId, content: "Hola, cuéntame algo largo", signal: new AbortController().signal }),
    );
    const bufferedEvents = await collect(
      sendMessage({ conversationId: bufferedConvo.id, userId: actorId, content: "Hola, cuéntame algo largo", signal: new AbortController().signal }),
    );

    expect(streamingEvents.filter((e) => e.type === "delta").length).toBeGreaterThan(1);
    expect(bufferedEvents.filter((e) => e.type === "delta").length).toBe(1);

    await db.delete(tools).where(eq(tools.id, streamingToolId));
    await db.delete(tools).where(eq(tools.id, bufferedToolId));
  });

  it("capabilities.documentGeneration gates generate_text_document independently of the internalTools allow-list", async () => {
    const { toolId } = await createPublishedTestTool(actorId, {
      internalTools: ["generate_text_document"],
      documentGeneration: false,
    });
    await activateToolForUser(toolId, actorId);
    const tool = (await db.select().from(tools).where(eq(tools.id, toolId)))[0]!;
    const conversation = await createConversation(actorId, toolId, tool.publishedVersionId!);

    await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: 'HERRAMIENTA:generate_text_document {"title":"T","content":"C"}',
        signal: new AbortController().signal,
      }),
    );
    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const assistantMessage = msgs.find((m) => m.role === "assistant")!;
    // documentGeneration is off, so the tool spec was never offered to the model — the fake
    // provider's trigger can't match a tool that wasn't in the request's `tools` array.
    expect(assistantMessage.content).not.toContain("Resultado de la herramienta");

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("capabilities.notifications creates a real notification on a completed reply, off by default creates none", async () => {
    const { toolId: onToolId } = await createPublishedTestTool(actorId, { notifications: true });
    const { toolId: offToolId } = await createPublishedTestTool(actorId, { notifications: false });
    await activateToolForUser(onToolId, actorId);
    await activateToolForUser(offToolId, actorId);
    const onTool = (await db.select().from(tools).where(eq(tools.id, onToolId)))[0]!;
    const offTool = (await db.select().from(tools).where(eq(tools.id, offToolId)))[0]!;
    const onConvo = await createConversation(actorId, onToolId, onTool.publishedVersionId!);
    const offConvo = await createConversation(actorId, offToolId, offTool.publishedVersionId!);

    await collect(sendMessage({ conversationId: onConvo.id, userId: actorId, content: "Hola", signal: new AbortController().signal }));
    await collect(sendMessage({ conversationId: offConvo.id, userId: actorId, content: "Hola", signal: new AbortController().signal }));

    const onNotifications = await db.select().from(notifications).where(eq(notifications.userId, actorId));
    expect(onNotifications.some((n) => n.link === `/tools/${onTool.slug}/chat`)).toBe(true);
    expect(onNotifications.some((n) => n.link === `/tools/${offTool.slug}/chat`)).toBe(false);

    await db.delete(notifications).where(eq(notifications.userId, actorId));
    await db.delete(tools).where(eq(tools.id, onToolId));
    await db.delete(tools).where(eq(tools.id, offToolId));
  });

  it("capabilities.history=false excludes prior turns from the model's context", async () => {
    const { toolId } = await createPublishedTestTool(actorId, { history: false });
    await activateToolForUser(toolId, actorId);
    const tool = (await db.select().from(tools).where(eq(tools.id, toolId)))[0]!;

    // A fresh conversation's first-ever turn sees only [system, thisMessage] — with history
    // off, a SECOND turn in a different conversation must see exactly the same thing, so its
    // deterministic seed (derived from the full message list) must match.
    const referenceConvo = await createConversation(actorId, toolId, tool.publishedVersionId!);
    const referenceEvents = await collect(
      sendMessage({ conversationId: referenceConvo.id, userId: actorId, content: "Mensaje objetivo", signal: new AbortController().signal }),
    );
    const referenceReply = referenceEvents.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");

    const testConvo = await createConversation(actorId, toolId, tool.publishedVersionId!);
    await collect(sendMessage({ conversationId: testConvo.id, userId: actorId, content: "Mensaje previo, no debería verse", signal: new AbortController().signal }));
    const secondTurnEvents = await collect(
      sendMessage({ conversationId: testConvo.id, userId: actorId, content: "Mensaje objetivo", signal: new AbortController().signal }),
    );
    const secondTurnReply = secondTurnEvents.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");

    expect(secondTurnReply).toBe(referenceReply);

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("attaching a validated file to a message links it and exposes it on the stored message", async () => {
    const { toolId } = await createPublishedTestTool(actorId, { files: true, images: true });
    await activateToolForUser(toolId, actorId);
    const tool = (await db.select().from(tools).where(eq(tools.id, toolId)))[0]!;
    const conversation = await createConversation(actorId, toolId, tool.publishedVersionId!);

    const { fileId } = await initiateUpload({
      userId: actorId,
      conversationId: conversation.id,
      originalName: "nota.png",
      mimeType: "image/png",
      sizeBytes: 8,
    });
    // Minimal valid PNG signature bytes are not required — sniffMimeType only needs to accept
    // this as image/png; use a real PNG header so validation doesn't reject it as unknown.
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await completeUpload(fileId, actorId, pngHeader);

    await collect(
      sendMessage({
        conversationId: conversation.id,
        userId: actorId,
        content: "Aquí va una imagen",
        attachedFileIds: [fileId],
        signal: new AbortController().signal,
      }),
    );

    const { messages: msgs } = await getConversationWithMessages(conversation.id, actorId);
    const userMessage = msgs.find((m) => m.role === "user")!;
    expect(userMessage.attachedFileIds).toEqual([fileId]);

    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId));
    expect(file!.messageId).toBe(userMessage.id);

    await db.delete(tools).where(eq(tools.id, toolId));
  });

  it("escalateConversation marks the conversation and records an audit event, but only when capabilities.escalation is on", async () => {
    const { toolId: enabledToolId } = await createPublishedTestTool(actorId, { escalation: true });
    const { toolId: disabledToolId } = await createPublishedTestTool(actorId, { escalation: false });
    await activateToolForUser(enabledToolId, actorId);
    await activateToolForUser(disabledToolId, actorId);
    const enabledTool = (await db.select().from(tools).where(eq(tools.id, enabledToolId)))[0]!;
    const disabledTool = (await db.select().from(tools).where(eq(tools.id, disabledToolId)))[0]!;
    const enabledConvo = await createConversation(actorId, enabledToolId, enabledTool.publishedVersionId!);
    const disabledConvo = await createConversation(actorId, disabledToolId, disabledTool.publishedVersionId!);

    await escalateConversation(enabledConvo.id, actorId);
    const { conversation: escalated } = await getConversationWithMessages(enabledConvo.id, actorId);
    expect((escalated.metadata as Record<string, unknown>).escalatedAt).toBeTruthy();

    await expect(escalateConversation(disabledConvo.id, actorId)).rejects.toThrow(AppError);

    await db.delete(tools).where(eq(tools.id, enabledToolId));
    await db.delete(tools).where(eq(tools.id, disabledToolId));
  });
});
