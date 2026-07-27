import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { conversations, dataRequests, sessions, userProfiles, users } from "@/db/schema";
import "@/lib/jobs/handlers";
import { hashPassword } from "@/lib/auth/password";
import { generateOpaqueToken, hashToken } from "@/lib/auth/tokens";
import { getJobProvider } from "@/lib/jobs";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation } from "@/lib/conversations/service";
import { createPublishedTestTool } from "../fixtures/tool-factory";

/**
 * Covers one of the two gaps a docs/privacy.md research pass surfaced (and this session was
 * asked to actually fix rather than leave as documented debt): account-deletion requests now
 * really get processed by a job instead of sitting PENDING forever. The registration flow's
 * new legalAcceptances write is covered in tests/security/access-control.spec.ts instead —
 * it needs a real HTTP request (next/headers-backed cookies/rate-limit context), which a
 * plain vitest integration test calling the route handler directly cannot provide.
 */
describe("account.process_deletion job", () => {
  let userId: string;
  let toolId: string;
  let versionId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `e2e-account-delete-${randomUUID()}@test.local`, passwordHash: await hashPassword("TestPassword!123"), status: "ACTIVE", emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    userId = user!.id;
    await db.insert(userProfiles).values({ userId, displayName: "Por Eliminar" });

    const created = await createPublishedTestTool(userId, {});
    toolId = created.toolId;
    versionId = created.versionId;
    await activateToolForUser(toolId, userId);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  });

  it("anonymizes the user, revokes sessions, logically deletes conversations, and completes the data request", async () => {
    // Insert the session row directly rather than via lib/auth/session.ts's createSession —
    // that helper reads/writes next/headers' cookies(), which only works inside a real
    // request scope, not a plain vitest integration test.
    await db.insert(sessions).values({
      userId,
      tokenHash: hashToken(generateOpaqueToken()),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mfaVerifiedAt: new Date(),
    });
    const conversation = await createConversation(userId, toolId, versionId);

    const [request] = await db.insert(dataRequests).values({ userId, kind: "deletion" }).returning({ id: dataRequests.id });
    await getJobProvider().enqueue("account.process_deletion", { requestId: request!.id, userId }, { idempotencyKey: `deletion:${request!.id}` });

    const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(updatedUser!.status).toBe("DELETED");
    expect(updatedUser!.deletedAt).toBeTruthy();
    expect(updatedUser!.email).toBe(`deleted-${userId}@deleted.invalid`);

    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    expect(profile!.displayName).toBeNull();

    const activeSessions = await db.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));
    expect(activeSessions).toHaveLength(0);

    const [updatedConversation] = await db.select().from(conversations).where(eq(conversations.id, conversation.id)).limit(1);
    expect(updatedConversation!.status).toBe("DELETED");

    const [updatedRequest] = await db.select().from(dataRequests).where(eq(dataRequests.id, request!.id)).limit(1);
    expect(updatedRequest!.status).toBe("COMPLETED");
    expect(updatedRequest!.completedAt).toBeTruthy();
  });
});
