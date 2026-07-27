import { z } from "zod";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, dataRequests, generatedFiles, sessions, uploadedFiles, userProfiles, users } from "@/db/schema";
import { registerJobHandler } from "../registry";
import { recordAuditEvent } from "@/lib/audit/log";

const payloadSchema = z.object({ requestId: z.string().uuid(), userId: z.string().uuid() });

/**
 * §26/§30 "derecho al olvido": completes what DELETE /api/v1/me only recorded until now.
 * Anonymizes identifying fields immediately (irreversible: email/displayName are not
 * recoverable after this runs), then reuses the two existing purge jobs instead of
 * duplicating their logic — conversations are logically deleted so retention_cleanup
 * purges message content on its normal schedule, and files are marked expired so
 * cleanup_expired_files removes the underlying blobs on its next run.
 */
registerJobHandler("account.process_deletion", async (rawPayload) => {
  const { requestId, userId } = payloadSchema.parse(rawPayload);
  const now = new Date();

  await db
    .update(users)
    .set({ status: "DELETED", deletedAt: now, email: `deleted-${userId}@deleted.invalid` })
    .where(eq(users.id, userId));

  await db.update(userProfiles).set({ displayName: null, avatarUrl: null }).where(eq(userProfiles.userId, userId));

  await db
    .update(sessions)
    .set({ status: "REVOKED", revokedAt: now })
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "ACTIVE")));

  await db
    .update(conversations)
    .set({ status: "DELETED", deletedAt: now })
    .where(and(eq(conversations.userId, userId), ne(conversations.status, "DELETED")));

  await db
    .update(uploadedFiles)
    .set({ expiresAt: now })
    .where(and(eq(uploadedFiles.userId, userId), isNull(uploadedFiles.deletedAt)));
  await db
    .update(generatedFiles)
    .set({ expiresAt: now })
    .where(and(eq(generatedFiles.userId, userId), isNull(generatedFiles.deletedAt)));

  await db.update(dataRequests).set({ status: "COMPLETED", completedAt: now }).where(eq(dataRequests.id, requestId));

  await recordAuditEvent({ actorId: userId, action: "account.deletion_completed", resourceType: "user", resourceId: userId });

  return { userId };
});
