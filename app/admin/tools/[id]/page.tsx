import { notFound } from "next/navigation";
import { and, eq, isNull, ne } from "drizzle-orm";
import { ensureEditableDraftVersion } from "@/lib/tools/service";
import { getAdminToolBuilderData, loadVersionConfig } from "@/lib/tools/repository";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ToolBuilder } from "@/components/admin/tools/ToolBuilder";
import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeDocuments } from "@/db/schema";
import { listToolProviderCredentials } from "@/lib/tools/provider-credentials";
import { listToolExternalCredentialOptions } from "@/lib/tools/external-credentials";
import { getUserPermissions } from "@/lib/permissions/rbac";

export default async function AdminToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  const permissions = await getUserPermissions(user.id);
  if (!permissions.has("tools.update")) notFound();
  const draftVersionId = await ensureEditableDraftVersion(id, user.id).catch(() => null);
  if (!draftVersionId) notFound();

  const builderData = await getAdminToolBuilderData(id).catch(() => null);
  if (!builderData) notFound();
  const { tool, versions, modelProviders } = builderData;
  const canManageCredentials = permissions.has("tools.credentials.manage");
  const [providerCredentials, externalCredentials, config, knowledgeBaseRows] = await Promise.all([
    canManageCredentials ? listToolProviderCredentials(id) : Promise.resolve([]),
    listToolExternalCredentialOptions(id),
    loadVersionConfig(draftVersionId),
    db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.toolId, id), isNull(knowledgeBases.deletedAt)))
      .limit(1),
  ]);
  const activeVersion = versions.find((version) => version.id === draftVersionId);
  if (!activeVersion) notFound();

  const knowledgeBase = knowledgeBaseRows[0] ?? null;
  const documents = knowledgeBase
    ? await db
        .select({
          id: knowledgeDocuments.id,
          name: knowledgeDocuments.name,
          status: knowledgeDocuments.status,
          sizeBytes: knowledgeDocuments.sizeBytes,
        })
        .from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.knowledgeBaseId, knowledgeBase.id), ne(knowledgeDocuments.status, "DELETED")))
    : [];

  return (
    <ToolBuilder
      tool={{ id: tool.id, slug: tool.slug, status: tool.status, publishedVersionId: tool.publishedVersionId }}
      versionId={draftVersionId}
      versionStatus={activeVersion.status}
      config={config}
      versions={versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status }))}
      providers={modelProviders.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        kind: p.kind,
        enabled: p.enabled,
      }))}
      providerCredentials={providerCredentials.map((credential) => ({
        providerId: credential.providerId,
        keyHint: credential.keyHint,
        baseUrl: credential.baseUrl,
        lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
        lastTestStatus: credential.lastTestStatus,
      }))}
      externalCredentials={externalCredentials.map((credential) => ({
        id: credential.id,
        name: credential.name,
        authType: credential.authType,
      }))}
      canManageCredentials={canManageCredentials}
      knowledgeBase={
        knowledgeBase
          ? {
              id: knowledgeBase.id,
              name: knowledgeBase.name,
              description: knowledgeBase.description,
              disabled: Boolean(knowledgeBase.disabledAt),
            }
          : null
      }
      knowledgeDocuments={documents}
    />
  );
}
