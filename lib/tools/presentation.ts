import type { ToolStatus, ToolVersionStatus } from "./state-machine";

export type VisiblePublicationStatus = "Borrador" | "En revisión" | "Publicada" | "Pausada" | "Archivada";

const TOOL_STATUS_LABELS: Record<ToolStatus, VisiblePublicationStatus> = {
  DRAFT: "Borrador",
  CONFIGURATION_INCOMPLETE: "Borrador",
  INTERNAL_TESTING: "Borrador",
  UNDER_REVIEW: "En revisión",
  APPROVED: "En revisión",
  SCHEDULED: "En revisión",
  PUBLISHED: "Publicada",
  PAUSED: "Pausada",
  SUSPENDED: "Pausada",
  ARCHIVED: "Archivada",
};

const VERSION_STATUS_LABELS: Record<ToolVersionStatus, VisiblePublicationStatus> = {
  DRAFT: "Borrador",
  TESTING: "Borrador",
  UNDER_REVIEW: "En revisión",
  APPROVED: "En revisión",
  SCHEDULED: "En revisión",
  PUBLISHED: "Publicada",
  SUPERSEDED: "Archivada",
  ROLLED_BACK: "Archivada",
};

export function getVisibleToolStatus(status: string): VisiblePublicationStatus {
  return TOOL_STATUS_LABELS[status as ToolStatus] ?? "Borrador";
}

export function getVisibleVersionStatus(status: string): VisiblePublicationStatus {
  return VERSION_STATUS_LABELS[status as ToolVersionStatus] ?? "Borrador";
}

export function getPublicationStatusTone(status: VisiblePublicationStatus) {
  if (status === "Publicada") return "success" as const;
  if (status === "En revisión" || status === "Pausada") return "warning" as const;
  return "neutral" as const;
}
