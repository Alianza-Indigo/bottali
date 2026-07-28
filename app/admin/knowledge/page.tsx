import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeDocuments } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { BookOpen, FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateKnowledgeBaseForm } from "@/components/admin/knowledge/CreateKnowledgeBaseForm";
import { KnowledgeDocumentUploader } from "@/components/admin/knowledge/KnowledgeDocumentUploader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Conocimiento — Admin" };

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

export default async function AdminKnowledgePage() {
  const bases = await db.select().from(knowledgeBases);
  const documents =
    bases.length > 0
      ? await db.select().from(knowledgeDocuments).where(inArray(knowledgeDocuments.knowledgeBaseId, bases.map((kb) => kb.id)))
      : [];
  const basesWithDocs = bases.map((kb) => ({
    ...kb,
    documents: documents.filter((document) => document.knowledgeBaseId === kb.id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={BookOpen}
        title="Conocimiento"
        description="Gestiona las fuentes documentales que respaldan las respuestas de tus herramientas."
      />
      <AdminPanel title="Nueva base de conocimiento" description="Crea un espacio para agrupar documentos relacionados.">
        <CreateKnowledgeBaseForm />
      </AdminPanel>
      {basesWithDocs.length === 0 ? (
        <EmptyState title="No hay bases de conocimiento todavía" />
      ) : (
        basesWithDocs.map((kb) => (
          <AdminPanel
            key={kb.id}
            title={kb.name}
            description={kb.description ?? `${kb.documents.length} documentos`}
            action={<FileText aria-hidden="true" className="h-4 w-4 text-ink-faint" />}
          >
              <ul className="mb-4 divide-y divide-border">
                {kb.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-ink">{doc.name}</span>
                    <Badge tone={STATUS_TONE[doc.status] ?? "neutral"}>{STATUS_LABEL[doc.status] ?? doc.status}</Badge>
                  </li>
                ))}
                {kb.documents.length === 0 && <li className="text-sm text-ink-faint">Sin documentos todavía.</li>}
              </ul>
              <KnowledgeDocumentUploader knowledgeBaseId={kb.id} />
          </AdminPanel>
        ))
      )}
    </div>
  );
}
