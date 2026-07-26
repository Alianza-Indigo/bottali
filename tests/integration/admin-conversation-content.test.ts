import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { auditEvents, messages, tools, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation } from "@/lib/conversations/service";
import { listConversationsForAdmin, readConversationContentForAdmin } from "@/lib/admin/conversation-content";
import { ValidationError } from "@/lib/utils/errors";
import { createPublishedTestTool } from "../fixtures/tool-factory";

/**
 * §30 "acceso excepcional a contenido de conversaciones": conversations.content.read is
 * separately gated from conversations.metadata.read, requires a real typed reason, is fully
 * audited, and returns only minimized fields (no cost/model/moderation internals). This
 * exercises the service layer directly (the route only adds the permission check on top).
 */
describe("admin conversation content read (§30)", () => {
  let actorId: string;
  let adminId: string;
  let toolId: string;
  let conversationId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `content-read-user-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    actorId = user!.id;
    const [admin] = await db
      .insert(users)
      .values({ email: `content-read-admin-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE" })
      .returning({ id: users.id });
    adminId = admin!.id;

    const created = await createPublishedTestTool(actorId, {});
    toolId = created.toolId;
    await activateToolForUser(toolId, actorId);
    const tool = (await db.select().from(tools).where(eq(tools.id, toolId)))[0]!;
    const conversation = await createConversation(actorId, toolId, tool.publishedVersionId!);
    conversationId = conversation.id;

    await db.insert(messages).values([
      { conversationId, role: "user", content: "Mensaje sensible del usuario", status: "COMPLETED" },
      { conversationId, role: "assistant", content: "Respuesta sensible del asistente", status: "COMPLETED" },
    ]);
  });

  afterAll(async () => {
    await db.delete(tools).where(eq(tools.id, toolId));
    await db.delete(users).where(eq(users.id, actorId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  it("rejects a reason shorter than the minimum", async () => {
    await expect(readConversationContentForAdmin({ conversationId, adminId, reason: "corto" })).rejects.toThrow(ValidationError);
  });

  it("returns only minimized fields and records an audited reason without leaking content into metadata", async () => {
    const reason = "Revisión de una denuncia reportada por el usuario.";
    const result = await readConversationContentForAdmin({ conversationId, adminId, reason });

    expect(result.messages).toHaveLength(2);
    for (const m of result.messages) {
      // Minimization (§30): only id/role/content/createdAt — no cost/tokens/model/moderation.
      expect(Object.keys(m).sort()).toEqual(["content", "createdAt", "id", "role"]);
    }
    expect(result.messages.map((m) => m.content)).toEqual(["Mensaje sensible del usuario", "Respuesta sensible del asistente"]);

    const [auditRow] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorId, adminId), eq(auditEvents.action, "admin.conversation.content_read")))
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    expect(auditRow).toBeDefined();
    expect(auditRow!.reason).toBe(reason);
    expect(auditRow!.resourceId).toBe(conversationId);
    expect(JSON.stringify(auditRow!.metadata)).not.toContain("sensible");
  });

  it("listConversationsForAdmin never includes message content, only metadata", async () => {
    const rows = await listConversationsForAdmin({ userId: actorId });
    expect(rows.some((r) => r.id === conversationId)).toBe(true);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["createdAt", "id", "lastMessageAt", "messageCount", "status", "toolSlug", "userEmail", "userId"].sort(),
      );
    }
  });
});
