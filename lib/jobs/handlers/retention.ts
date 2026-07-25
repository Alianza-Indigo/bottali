import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages, notifications } from "@/db/schema";
import { registerJobHandler } from "../registry";

const DEFAULT_DELETED_CONVERSATION_RETENTION_DAYS = 90;
const DEFAULT_READ_NOTIFICATION_RETENTION_DAYS = 30;

/**
 * §30 privacy-by-retention: user-initiated "delete" is logical (deleteConversation just
 * sets status=DELETED/deletedAt). This job is what actually purges the underlying message
 * content once the retention window has passed — conversations stay logically deleted and
 * queryable-as-gone immediately, but their content isn't hard-removed until this runs.
 */
registerJobHandler("retention_cleanup", async () => {
  const conversationCutoff = new Date(Date.now() - DEFAULT_DELETED_CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const dueConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.status, "DELETED"), lt(conversations.deletedAt, conversationCutoff)))
    .limit(200);

  for (const conversation of dueConversations) {
    await db.delete(messages).where(eq(messages.conversationId, conversation.id));
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
  }

  const notificationCutoff = new Date(Date.now() - DEFAULT_READ_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deletedNotifications = await db
    .delete(notifications)
    .where(and(lt(notifications.readAt, notificationCutoff)))
    .returning({ id: notifications.id });

  return { conversationsPurged: dueConversations.length, notificationsPurged: deletedNotifications.length };
});
