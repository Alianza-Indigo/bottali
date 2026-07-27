import { notFound } from "next/navigation";
import { ensureEditableDraftVersion } from "@/lib/tools/service";
import { getAdminToolBuilderData, loadVersionConfig } from "@/lib/tools/repository";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ToolBuilder } from "@/components/admin/tools/ToolBuilder";

export default async function AdminToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const builderData = await getAdminToolBuilderData(id).catch(() => null);
  if (!builderData) notFound();
  const { tool, versions, modelProviders } = builderData;

  const draftVersionId = await ensureEditableDraftVersion(id, user.id);
  const config = await loadVersionConfig(draftVersionId);
  const activeVersion = versions.find((version) => version.id === draftVersionId);
  if (!activeVersion) notFound();

  return (
    <ToolBuilder
      tool={{ id: tool.id, slug: tool.slug, status: tool.status, publishedVersionId: tool.publishedVersionId }}
      versionId={draftVersionId}
      versionStatus={activeVersion.status}
      config={config}
      versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status }))}
      providers={modelProviders.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
    />
  );
}
