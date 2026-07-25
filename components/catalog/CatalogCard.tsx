"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiPost, ApiError } from "@/lib/api/client";
import type { CatalogState } from "@/lib/tools/access";

export interface CatalogToolSummary {
  id: string;
  slug: string;
  category: string | null;
  name: string;
  description: string;
  iconUrl: string | null;
  primaryColor: string;
  hasVoice: boolean;
  hasFiles: boolean;
  state: CatalogState;
}

const STATE_LABELS: Record<CatalogState, { label: string; tone: BadgeTone }> = {
  AVAILABLE: { label: "Disponible", tone: "neutral" },
  ACTIVE: { label: "Activa", tone: "success" },
  ACCESS_REQUESTED: { label: "Solicitud enviada", tone: "warning" },
  APPROVAL_REQUIRED: { label: "Requiere aprobación", tone: "warning" },
  INVITATION_ONLY: { label: "Solo por invitación", tone: "neutral" },
  COMING_SOON: { label: "Próximamente", tone: "neutral" },
  PAUSED: { label: "Pausada", tone: "warning" },
  SUSPENDED: { label: "Suspendida", tone: "danger" },
  EXPIRED: { label: "Expirada", tone: "danger" },
};

export function CatalogCard({ tool }: { tool: CatalogToolSummary }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateInfo = STATE_LABELS[tool.state];

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiPost(`/api/v1/catalog/${tool.id}/activate`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible activar la herramienta.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiPost(`/api/v1/catalog/${tool.id}/request-access`, {});
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid={`tool-card-${tool.slug}`}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: tool.primaryColor }}
            >
              {tool.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="font-medium text-ink">{tool.name}</p>
              {tool.category && <p className="text-xs text-ink-faint">{tool.category}</p>}
            </div>
          </div>
          <Badge tone={stateInfo.tone}>{stateInfo.label}</Badge>
        </div>
        <p className="text-sm text-ink-muted">{tool.description}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {tool.state === "ACTIVE" && (
            <Link href={`/tools/${tool.slug}/chat`}>
              <Button size="sm">Abrir</Button>
            </Link>
          )}
          {tool.state === "AVAILABLE" && (
            <Button size="sm" loading={loading} onClick={handleActivate}>
              Activar
            </Button>
          )}
          {tool.state === "APPROVAL_REQUIRED" && (
            <Button size="sm" variant="secondary" loading={loading} onClick={handleRequestAccess}>
              Solicitar acceso
            </Button>
          )}
          <Link href={`/tools/${tool.slug}`}>
            <Button size="sm" variant="ghost">
              Más información
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
