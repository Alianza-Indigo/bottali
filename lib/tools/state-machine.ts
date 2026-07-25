import { ConflictError } from "@/lib/utils/errors";

export type ToolStatus =
  | "DRAFT"
  | "CONFIGURATION_INCOMPLETE"
  | "INTERNAL_TESTING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "PAUSED"
  | "SUSPENDED"
  | "ARCHIVED";

/** Verbatim transition table from the platform spec (§6). No transition outside this
 * table is permitted — `assertValidToolTransition` is the single enforcement point. */
export const TOOL_STATE_TRANSITIONS: Record<ToolStatus, ToolStatus[]> = {
  DRAFT: ["CONFIGURATION_INCOMPLETE", "INTERNAL_TESTING"],
  CONFIGURATION_INCOMPLETE: ["DRAFT", "INTERNAL_TESTING"],
  INTERNAL_TESTING: ["DRAFT", "UNDER_REVIEW"],
  UNDER_REVIEW: ["INTERNAL_TESTING", "APPROVED"],
  APPROVED: ["SCHEDULED", "PUBLISHED"],
  SCHEDULED: ["PUBLISHED", "APPROVED"],
  PUBLISHED: ["PAUSED", "SUSPENDED", "ARCHIVED"],
  PAUSED: ["PUBLISHED", "SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["PAUSED", "ARCHIVED"],
  ARCHIVED: [],
};

export function isValidToolTransition(from: ToolStatus, to: ToolStatus): boolean {
  if (from === to) return true; // idempotent no-op transitions are allowed
  return TOOL_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidToolTransition(from: ToolStatus, to: ToolStatus): void {
  if (!isValidToolTransition(from, to)) {
    throw new ConflictError(
      `Transición de estado no permitida: ${from} → ${to}. Transiciones válidas desde ${from}: ${
        TOOL_STATE_TRANSITIONS[from]?.join(", ") || "(ninguna)"
      }.`,
    );
  }
}

export type ToolVersionStatus =
  | "DRAFT"
  | "TESTING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "ROLLED_BACK";

/**
 * Per-version lifecycle. This is a finer-grained companion to the tool-level machine
 * above: a tool can be PUBLISHED (serving `publishedVersionId`) while a separate DRAFT
 * version is being edited concurrently for the next release.
 */
export const VERSION_STATE_TRANSITIONS: Record<ToolVersionStatus, ToolVersionStatus[]> = {
  DRAFT: ["TESTING"],
  TESTING: ["DRAFT", "UNDER_REVIEW"],
  UNDER_REVIEW: ["TESTING", "APPROVED"],
  APPROVED: ["SCHEDULED", "PUBLISHED"],
  SCHEDULED: ["PUBLISHED", "APPROVED"],
  PUBLISHED: ["SUPERSEDED", "ROLLED_BACK"],
  SUPERSEDED: [],
  ROLLED_BACK: [],
};

export function assertValidVersionTransition(from: ToolVersionStatus, to: ToolVersionStatus): void {
  if (from === to) return;
  if (!VERSION_STATE_TRANSITIONS[from]?.includes(to)) {
    throw new ConflictError(`Transición de versión no permitida: ${from} → ${to}.`);
  }
}
