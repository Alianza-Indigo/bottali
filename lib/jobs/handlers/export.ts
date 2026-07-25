import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, consents, dataRequests, messages, uploadedFiles, userProfiles, users } from "@/db/schema";
import { registerJobHandler } from "../registry";
import { getStorageAdapter } from "@/lib/storage";

const payloadSchema = z.object({ requestId: z.string().uuid(), userId: z.string().uuid() });

/** §26/§30: gathers the user's own data (profile, conversations+messages, file metadata,
 * consents) into a single JSON export, stored in Blob and referenced by the data_requests
 * row — never inline in the request handler, since export size is unbounded. */
registerJobHandler("account.export_data", async (rawPayload) => {
  const { requestId, userId } = payloadSchema.parse(rawPayload);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const userConversations = await db.select().from(conversations).where(eq(conversations.userId, userId));
  const conversationIds = userConversations.map((c) => c.id);
  const userMessages = conversationIds.length
    ? (await Promise.all(conversationIds.map((id) => db.select().from(messages).where(eq(messages.conversationId, id))))).flat()
    : [];
  const files = await db.select().from(uploadedFiles).where(eq(uploadedFiles.userId, userId));
  const userConsents = await db.select().from(consents).where(eq(consents.userId, userId));

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    user: user ? { id: user.id, email: user.email, createdAt: user.createdAt } : null,
    profile,
    conversations: userConversations,
    messages: userMessages,
    files: files.map((f) => ({ id: f.id, originalName: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt })),
    consents: userConsents,
  };

  const buffer = Buffer.from(JSON.stringify(exportPayload, null, 2), "utf-8");
  const blobKey = `exports/${userId}/${requestId}.json`;
  await getStorageAdapter().put(blobKey, buffer, "application/json");

  await db.update(dataRequests).set({ status: "COMPLETED", completedAt: new Date(), resultBlobKey: blobKey }).where(eq(dataRequests.id, requestId));

  return { blobKey, sizeBytes: buffer.length };
});
