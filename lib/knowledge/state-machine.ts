import { ConflictError } from "@/lib/utils/errors";

export type KnowledgeDocumentStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "VALIDATING"
  | "PROCESSING"
  | "INDEXING"
  | "READY"
  | "FAILED"
  | "DISABLED"
  | "DELETED";

export const DOCUMENT_STATE_TRANSITIONS: Record<KnowledgeDocumentStatus, KnowledgeDocumentStatus[]> = {
  UPLOADING: ["UPLOADED", "FAILED", "DELETED"],
  UPLOADED: ["VALIDATING", "FAILED", "DELETED"],
  VALIDATING: ["PROCESSING", "FAILED", "DELETED"],
  PROCESSING: ["INDEXING", "FAILED", "DELETED"],
  INDEXING: ["READY", "FAILED", "DELETED"],
  READY: ["DISABLED", "DELETED", "VALIDATING"], // VALIDATING: reindexDocument reprocessing an already-indexed document
  FAILED: ["VALIDATING", "DELETED"],
  DISABLED: ["READY", "DELETED"],
  DELETED: [],
};

export function assertValidDocumentTransition(from: KnowledgeDocumentStatus, to: KnowledgeDocumentStatus): void {
  if (from === to) return;
  if (!DOCUMENT_STATE_TRANSITIONS[from]?.includes(to)) {
    throw new ConflictError(`Transición de documento no permitida: ${from} → ${to}.`);
  }
}
