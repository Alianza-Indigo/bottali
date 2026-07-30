import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uploadedFiles } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileRow } from "@/components/files/FileRow";

export const metadata = { title: "Archivos" };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const user = await requireCurrentUser();

  const files = await db
    .select()
    .from(uploadedFiles)
    .where(
      and(
        eq(uploadedFiles.organizationId, user.organizationId),
        eq(uploadedFiles.userId, user.id),
        isNull(uploadedFiles.deletedAt),
      ),
    )
    .orderBy(desc(uploadedFiles.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Mis archivos</h1>
      {files.length === 0 ? (
        <EmptyState title="No has subido archivos todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {files.map((file) => (
              <FileRow
                key={file.id}
                id={file.id}
                originalName={file.originalName}
                sizeLabel={formatSize(file.sizeBytes)}
                status={file.status}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
