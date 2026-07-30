"use client";

import { useState } from "react";
import type { FullVersionConfig } from "@/lib/tools/repository";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IdentitySection } from "./sections/IdentitySection";
import { BehaviorSection } from "./sections/BehaviorSection";
import { ModelsSection } from "./sections/ModelsSection";
import { CapabilitiesSection } from "./sections/CapabilitiesSection";
import { KnowledgeSection } from "./sections/KnowledgeSection";
import { AccessSection } from "./sections/AccessSection";
import { SafetySection } from "./sections/SafetySection";
import { PwaSection } from "./sections/PwaSection";
import { ApiCredentialsSection } from "./sections/ApiCredentialsSection";
import { LifecyclePanel } from "./LifecyclePanel";
import { getPublicationStatusTone, getVisibleToolStatus } from "@/lib/tools/presentation";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export interface ToolBuilderProps {
  tool: { id: string; slug: string; status: string; publishedVersionId: string | null };
  versionId: string;
  versionStatus: string;
  config: FullVersionConfig;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  providers: Array<{ id: string; key: string; name: string; kind: string; enabled: boolean }>;
  providerCredentials: Array<{
    providerId: string;
    keyHint: string;
    baseUrl: string | null;
    lastTestedAt: string | null;
    lastTestStatus: string | null;
  }>;
  externalCredentials: Array<{ id: string; name: string; authType: string }>;
  canManageCredentials: boolean;
  knowledgeBase: { id: string; name: string; description: string | null; disabled: boolean } | null;
  knowledgeDocuments: Array<{ id: string; name: string; status: string; sizeBytes: number }>;
}

const TABS = [
  { key: "identity", label: "Identidad" },
  { key: "behavior", label: "Comportamiento" },
  { key: "knowledge", label: "Conocimiento" },
  { key: "models", label: "Modelo" },
  { key: "apis", label: "APIs" },
  { key: "capabilities", label: "Capacidades" },
  { key: "access", label: "Acceso" },
  { key: "safety", label: "Seguridad" },
  { key: "pwa", label: "PWA" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ToolBuilder({
  tool,
  versionId,
  versionStatus,
  config,
  versions,
  providers,
  providerCredentials,
  externalCredentials,
  canManageCredentials,
  knowledgeBase,
  knowledgeDocuments,
}: ToolBuilderProps) {
  const [tab, setTab] = useState<TabKey>("identity");
  const visibleStatus = getVisibleToolStatus(tool.status);
  const visibleTabs = TABS.filter((item) => item.key !== "apis" || canManageCredentials);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={SlidersHorizontal}
        title={config.branding?.name ?? tool.slug}
        description={`Configura la versión editable de ${tool.slug}.`}
        actions={<Badge tone={getPublicationStatusTone(visibleStatus)}>{visibleStatus}</Badge>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AdminPanel contentClassName="">
          <nav aria-label="Secciones de configuración" className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {visibleTabs.map((t) => (
              <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "ghost"} onClick={() => setTab(t.key)}>
                {t.label}
              </Button>
            ))}
          </nav>
          <div className="p-4 sm:p-5">
            {tab === "identity" && <IdentitySection toolId={tool.id} versionId={versionId} initial={config.branding} />}
            {tab === "behavior" && <BehaviorSection toolId={tool.id} versionId={versionId} initial={config.behavior} />}
            {tab === "knowledge" && (
              <KnowledgeSection
                toolId={tool.id}
                toolName={config.branding?.name ?? tool.slug}
                ragEnabled={Boolean(config.capabilities?.rag)}
                knowledgeBase={knowledgeBase}
                documents={knowledgeDocuments}
                onOpenCapabilities={() => setTab("capabilities")}
              />
            )}
            {tab === "models" && <ModelsSection toolId={tool.id} versionId={versionId} initial={config.models} providers={providers} />}
            {tab === "apis" && canManageCredentials && (
              <ApiCredentialsSection
                toolId={tool.id}
                providers={providers}
                initialCredentials={providerCredentials}
              />
            )}
            {tab === "capabilities" && (
              <CapabilitiesSection
                toolId={tool.id}
                versionId={versionId}
                initial={config.capabilities}
                externalCredentials={externalCredentials}
                canManageCredentials={canManageCredentials}
              />
            )}
            {tab === "access" && <AccessSection toolId={tool.id} versionId={versionId} initial={config.accessRules} />}
            {tab === "safety" && <SafetySection toolId={tool.id} versionId={versionId} initial={config.safetyPolicies} />}
            {tab === "pwa" && <PwaSection toolId={tool.id} versionId={versionId} initial={config.pwaConfig} />}
          </div>
        </AdminPanel>
        <div className="min-w-0">
          <LifecyclePanel toolId={tool.id} versionId={versionId} versionStatus={versionStatus} versions={versions} toolStatus={tool.status} />
        </div>
      </div>
    </div>
  );
}
