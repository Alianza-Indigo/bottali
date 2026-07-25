import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolAssignments } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit/log";

export type AssignmentSubjectType = "USER" | "GROUP" | "ROLE";
export type AssignmentDecision = "ALLOW" | "DENY";

export async function assignTool(
  toolId: string,
  subjectType: AssignmentSubjectType,
  subjectId: string,
  decision: AssignmentDecision,
  actorId: string,
): Promise<void> {
  const values: typeof toolAssignments.$inferInsert = { toolId, subjectType, decision, assignedBy: actorId };
  if (subjectType === "USER") values.userId = subjectId;
  if (subjectType === "GROUP") values.groupId = subjectId;
  if (subjectType === "ROLE") values.roleId = subjectId;

  await db.insert(toolAssignments).values(values);
  await recordAuditEvent({ actorId, action: "tool.assign", resourceType: "tool", resourceId: toolId, metadata: { subjectType, subjectId, decision } });
}

export async function revokeToolAssignment(toolId: string, subjectType: AssignmentSubjectType, subjectId: string, actorId: string): Promise<void> {
  const column = subjectType === "USER" ? toolAssignments.userId : subjectType === "GROUP" ? toolAssignments.groupId : toolAssignments.roleId;
  await db.delete(toolAssignments).where(and(eq(toolAssignments.toolId, toolId), eq(column, subjectId)));
  await recordAuditEvent({ actorId, action: "tool.assign.revoke", resourceType: "tool", resourceId: toolId, metadata: { subjectType, subjectId } });
}

export async function listToolAssignments(toolId: string) {
  return db.select().from(toolAssignments).where(eq(toolAssignments.toolId, toolId));
}
