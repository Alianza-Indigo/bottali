import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
  "DELETED",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
]);

export const toolStatusEnum = pgEnum("tool_status", [
  "DRAFT",
  "CONFIGURATION_INCOMPLETE",
  "INTERNAL_TESTING",
  "UNDER_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "PAUSED",
  "SUSPENDED",
  "ARCHIVED",
]);

export const toolVersionStatusEnum = pgEnum("tool_version_status", [
  "DRAFT",
  "TESTING",
  "UNDER_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "SUPERSEDED",
  "ROLLED_BACK",
]);

export const evaluationStatusOnVersionEnum = pgEnum("evaluation_status_on_version", [
  "NOT_RUN",
  "PASSED",
  "FAILED",
  "SKIPPED",
]);

export const accessModeEnum = pgEnum("access_mode", [
  "ALL_USERS",
  "SELECTED_USERS",
  "GROUPS",
  "ROLES",
  "INVITATION",
  "REQUEST_APPROVAL",
]);

export const catalogStateEnum = pgEnum("catalog_state", [
  "AVAILABLE",
  "ACTIVE",
  "ACCESS_REQUESTED",
  "APPROVAL_REQUIRED",
  "INVITATION_ONLY",
  "COMING_SOON",
  "PAUSED",
  "SUSPENDED",
  "EXPIRED",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "ACTIVE",
  "ARCHIVED",
  "DELETED",
  "BLOCKED",
  "INTERRUPTED",
  "EXPORTING",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "PENDING",
  "STREAMING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "BLOCKED",
]);

export const memoryModeEnum = pgEnum("memory_mode", [
  "DISABLED",
  "CONVERSATION_ONLY",
  "SESSION_ONLY",
  "USER_APPROVED",
  "STRUCTURED",
  "LONG_TERM",
]);

export const knowledgeDocumentStatusEnum = pgEnum("knowledge_document_status", [
  "UPLOADING",
  "UPLOADED",
  "VALIDATING",
  "PROCESSING",
  "INDEXING",
  "READY",
  "FAILED",
  "DISABLED",
  "DELETED",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "RETRYING",
  "COMPLETED",
  "FAILED",
  "CANCELLING",
  "CANCELLED",
  "DEAD_LETTER",
]);

export const evaluationRunStatusEnum = pgEnum("evaluation_run_status", [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const fileStatusEnum = pgEnum("file_status", [
  "PENDING",
  "UPLOADED",
  "VALIDATED",
  "REJECTED",
  "DELETED",
]);

export const riskLevelEnum = pgEnum("risk_level", ["LOW", "MEDIUM", "HIGH"]);

export const toolCallConfirmationStatusEnum = pgEnum("tool_call_confirmation_status", [
  "PENDING",
  /** Atomically claimed by exactly one approve request, momentarily, while the tool actually
   * runs — this is what makes concurrent approve/reject/expire attempts mutually exclusive
   * instead of racing (see lib/conversations/tool-confirmations.ts's claim functions). */
  "EXECUTING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);
