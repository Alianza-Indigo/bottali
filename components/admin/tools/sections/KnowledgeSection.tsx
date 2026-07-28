"use client";

import { BookOpen, FileText, Info } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CreateKnowledgeBaseForm } from "@/components/admin/knowledge/CreateKnowledgeBaseForm";
import { KnowledgeDocumentUploader } from "@/components/admin/knowledge/KnowledgeDocumentUploader";

interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string | null;
  disabled: boolean;
}

interface KnowledgeDocumentSummary {
  id: string;
  name: string;
  status: string;
  sizeBytes: number;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  READY: "success",
  FAILED: "danger",
  PROCESSING: "brand",
  INDEXING: "brand",
  VALIDATING: "neutral",
  UPLOADED: "neutral",
  UPLOADING: "neutral",
  DISABLED: "neutral",
  DELETED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  READY: "Disponible",
  FAILED: "Error",
  PROCESSING: "Procesando",
  INDEXING: "Indexando",
  VALIDATING: "Validando",
  UPLOADED: "Cargado",
  UPLOADING: "Subiendo",
  DISABLED: "Deshabilitado",
  DELETED: "Eliminado",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeSection({
  toolId,
  toolName,
  ragEnabled,
  knowledgeBase,
  documents,
  onOpenCapabilities,
}: {
  toolId: string;
  toolName: string;
  ragEnabled: boolean;
  knowledgeBase: KnowledgeBaseSummary | null;
  documents: KnowledgeDocumentSummary[];
  onOpenCapabilities: () => void;
}) {
  if (!knowledgeBase) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-teal-50 text-teal-700">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Base de conocimiento</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Crea el espacio documental exclusivo de esta herramienta. Sus fuentes no se comparten con otras herramientas.
            </p>
          </div>
        </div>
        <CreateKnowledgeBaseForm toolId={toolId} defaultName={`Conocimiento de ${toolName}`} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!ragEnabled && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>La base está configurada, pero RAG no está activo en esta versión.</span>
            <Button type="button" size="sm" variant="secondary" onClick={onOpenCapabilities}>
              Activar en Capacidades
            </Button>
          </div>
        </Alert>
      )}
      {knowledgeBase.disabled && (
        <Alert tone="warning">Esta base está deshabilitada y no se utilizará para responder conversaciones.</Alert>
      )}

      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{knowledgeBase.name}</h2>
            <Badge tone={knowledgeBase.disabled ? "neutral" : "success"}>
              {knowledgeBase.disabled ? "Deshabilitada" : "Activa"}
            </Badge>
          </div>
          {knowledgeBase.description && <p className="mt-1 text-sm text-ink-muted">{knowledgeBase.description}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <FileText className="h-4 w-4" aria-hidden="true" />
          {documents.length} documentos
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Documentos</h3>
          <Info className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        </div>
        {documents.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-medium text-ink">Aún no hay documentos</p>
            <p className="mt-1 text-xs text-ink-muted">Carga PDF, DOCX, TXT, Markdown o HTML.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-[8px] border border-border">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{document.name}</p>
                  <p className="text-xs text-ink-faint">{formatSize(document.sizeBytes)}</p>
                </div>
                <Badge tone={STATUS_TONE[document.status] ?? "neutral"}>
                  {STATUS_LABEL[document.status] ?? document.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!knowledgeBase.disabled && (
        <div className="border-t border-border pt-5">
          <p className="mb-2 text-sm font-medium text-ink">Agregar documento</p>
          <KnowledgeDocumentUploader knowledgeBaseId={knowledgeBase.id} />
        </div>
      )}
    </div>
  );
}
