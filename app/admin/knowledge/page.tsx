import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeDocuments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateKnowledgeBaseForm } from "@/components/admin/knowledge/CreateKnowledgeBaseForm";
import { KnowledgeDocumentUploader } from "@/components/admin/knowledge/KnowledgeDocumentUploader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

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

export default async function AdminKnowledgePage() {
  const bases = await db.select().from(knowledgeBases);
  const basesWithDocs = await Promise.all(
    bases.map(async (kb) => ({
      ...kb,
      documents: await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.knowledgeBaseId, kb.id)),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Bases de conocimiento</h1>
      <CreateKnowledgeBaseForm />
      {basesWithDocs.length === 0 ? (
        <EmptyState title="No hay bases de conocimiento todavía" />
      ) : (
        basesWithDocs.map((kb) => (
          <Card key={kb.id}>
            <CardBody className="flex flex-col gap-3">
              <div>
                <p className="font-medium text-ink">{kb.name}</p>
                {kb.description && <p className="text-sm text-ink-muted">{kb.description}</p>}
              </div>
              <ul className="flex flex-col gap-1">
                {kb.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{doc.name}</span>
                    <Badge tone={STATUS_TONE[doc.status] ?? "neutral"}>{doc.status}</Badge>
                  </li>
                ))}
                {kb.documents.length === 0 && <li className="text-sm text-ink-faint">Sin documentos todavía.</li>}
              </ul>
              <KnowledgeDocumentUploader knowledgeBaseId={kb.id} />
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
