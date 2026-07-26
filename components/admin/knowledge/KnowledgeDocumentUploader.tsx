"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError, csrfHeaders } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function KnowledgeDocumentUploader({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFileSelected = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { documentId } = await apiPost<{ documentId: string }>(`/api/v1/admin/knowledge-bases/${knowledgeBaseId}/documents`, {
        originalName: file.name,
        mimeType: file.type || "text/plain",
        sizeBytes: file.size,
      });

      const bytes = await file.arrayBuffer();
      const res = await fetch(`/api/v1/admin/knowledge-documents/${documentId}/upload-complete`, {
        method: "POST",
        headers: csrfHeaders(),
        body: bytes,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "No fue posible completar la carga.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Error al subir el documento.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.html"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
          className="text-sm text-ink-muted"
        />
        {uploading && (
          <Button size="sm" loading disabled>
            Subiendo...
          </Button>
        )}
      </div>
    </div>
  );
}
