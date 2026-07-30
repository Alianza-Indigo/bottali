import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db/client";
import { evaluationCases, evaluationRuns, tools } from "@/db/schema";
import { Badge } from "@/components/ui/Badge";
import { AddCaseForm } from "@/components/admin/evaluations/AddCaseForm";
import { RunSuiteButton } from "@/components/admin/evaluations/RunSuiteButton";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getEvaluationSuiteForOrganization } from "@/lib/evaluations/service";

export default async function EvaluationSuiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireCurrentUser();
  const suite = await getEvaluationSuiteForOrganization(id, admin.organizationId).catch(() => null);
  if (!suite) notFound();

  const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.suiteId, id));
  const runs = await db.select().from(evaluationRuns).where(eq(evaluationRuns.suiteId, id));
  const toolRows = await db.select().from(tools).where(eq(tools.id, suite.toolId)).limit(1);
  const tool = toolRows[0];
  const toolVersionId = tool?.draftVersionId ?? tool?.publishedVersionId ?? null;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={FlaskConical}
        title={suite.name}
        description={suite.description ?? "Casos y ejecuciones de esta suite de evaluación."}
      />

      <AdminPanel title={`Casos (${cases.length})`} description="Entradas utilizadas para validar el comportamiento esperado.">
          <ul className="mb-4 flex flex-col gap-2">
            {cases.map((c) => (
              <li key={c.id} className="rounded-md bg-surface-subtle p-2 text-sm text-ink">
                {c.input}
              </li>
            ))}
            {cases.length === 0 && <li className="text-sm text-ink-faint">Sin casos todavía.</li>}
          </ul>
          <div className="border-t border-border pt-4">
            <AddCaseForm suiteId={id} />
          </div>
      </AdminPanel>

      <AdminPanel title={`Ejecuciones (${runs.length})`} description="Resultados históricos de la suite contra versiones de la herramienta.">
        <div className="flex flex-col gap-3">
          {toolVersionId ? (
            <RunSuiteButton suiteId={id} toolVersionId={toolVersionId} />
          ) : (
            <p className="text-sm text-ink-faint">La herramienta no tiene una versión disponible para probar.</p>
          )}
          <ul className="flex flex-col gap-2">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-faint">{new Date(run.createdAt).toLocaleString("es")}</span>
                <Badge tone={run.passed === 1 ? "success" : run.status === "COMPLETED" ? "danger" : "neutral"}>
                  {run.status}
                  {run.passed !== null ? (run.passed === 1 ? " · aprobada" : " · fallida") : ""}
                </Badge>
              </li>
            ))}
            {runs.length === 0 && <li className="text-sm text-ink-faint">Sin ejecuciones todavía.</li>}
          </ul>
        </div>
      </AdminPanel>
    </div>
  );
}
