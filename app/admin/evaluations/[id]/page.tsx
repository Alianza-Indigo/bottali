import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { evaluationCases, evaluationRuns, evaluationSuites, tools } from "@/db/schema";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AddCaseForm } from "@/components/admin/evaluations/AddCaseForm";
import { RunSuiteButton } from "@/components/admin/evaluations/RunSuiteButton";

export default async function EvaluationSuiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(evaluationSuites).where(eq(evaluationSuites.id, id)).limit(1);
  const suite = rows[0];
  if (!suite) notFound();

  const cases = await db.select().from(evaluationCases).where(eq(evaluationCases.suiteId, id));
  const runs = await db.select().from(evaluationRuns).where(eq(evaluationRuns.suiteId, id));
  const toolRows = await db.select().from(tools).where(eq(tools.id, suite.toolId)).limit(1);
  const tool = toolRows[0];
  const toolVersionId = tool?.draftVersionId ?? tool?.publishedVersionId ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">{suite.name}</h1>
      {suite.description && <p className="text-sm text-ink-muted">{suite.description}</p>}

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-semibold text-ink-muted uppercase tracking-wide">Casos</h2>
          <ul className="flex flex-col gap-2">
            {cases.map((c) => (
              <li key={c.id} className="rounded-md bg-surface-subtle p-2 text-sm text-ink">
                {c.input}
              </li>
            ))}
            {cases.length === 0 && <li className="text-sm text-ink-faint">Sin casos todavía.</li>}
          </ul>
          <div className="mt-3">
            <AddCaseForm suiteId={id} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Ejecuciones</h2>
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
        </CardBody>
      </Card>
    </div>
  );
}
