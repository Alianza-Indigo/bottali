"use client";

import { useState } from "react";
import type { FullVersionConfig } from "@/lib/tools/repository";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IdentitySection } from "./sections/IdentitySection";
import { BehaviorSection } from "./sections/BehaviorSection";
import { ModelsSection } from "./sections/ModelsSection";
import { CapabilitiesSection } from "./sections/CapabilitiesSection";
import { AccessSection } from "./sections/AccessSection";
import { SafetySection } from "./sections/SafetySection";
import { PwaSection } from "./sections/PwaSection";
import { LifecyclePanel } from "./LifecyclePanel";

export interface ToolBuilderProps {
  tool: { id: string; slug: string; status: string; publishedVersionId: string | null };
  versionId: string;
  config: FullVersionConfig;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  providers: Array<{ id: string; name: string; kind: string }>;
}

const TABS = [
  { key: "identity", label: "Identidad" },
  { key: "behavior", label: "Comportamiento" },
  { key: "models", label: "Modelo" },
  { key: "capabilities", label: "Capacidades" },
  { key: "access", label: "Acceso" },
  { key: "safety", label: "Seguridad" },
  { key: "pwa", label: "PWA" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ToolBuilder({ tool, versionId, config, versions, providers }: ToolBuilderProps) {
  const [tab, setTab] = useState<TabKey>("identity");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{config.branding?.name ?? tool.slug}</h1>
          <Badge tone={tool.status === "PUBLISHED" ? "success" : "neutral"}>{tool.status}</Badge>
        </div>
        <Card>
          <nav aria-label="Secciones de configuración" className="flex flex-wrap gap-1 border-b border-border p-2">
            {TABS.map((t) => (
              <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "ghost"} onClick={() => setTab(t.key)}>
                {t.label}
              </Button>
            ))}
          </nav>
          <div className="p-5">
            {tab === "identity" && <IdentitySection toolId={tool.id} versionId={versionId} initial={config.branding} />}
            {tab === "behavior" && <BehaviorSection toolId={tool.id} versionId={versionId} initial={config.behavior} />}
            {tab === "models" && <ModelsSection toolId={tool.id} versionId={versionId} initial={config.models} providers={providers} />}
            {tab === "capabilities" && <CapabilitiesSection toolId={tool.id} versionId={versionId} initial={config.capabilities} />}
            {tab === "access" && <AccessSection toolId={tool.id} versionId={versionId} initial={config.accessRules} />}
            {tab === "safety" && <SafetySection toolId={tool.id} versionId={versionId} initial={config.safetyPolicies} />}
            {tab === "pwa" && <PwaSection toolId={tool.id} versionId={versionId} initial={config.pwaConfig} />}
          </div>
        </Card>
      </div>
      <LifecyclePanel toolId={tool.id} versionId={versionId} versions={versions} toolStatus={tool.status} />
    </div>
  );
}
