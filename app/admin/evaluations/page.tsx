import Link from "next/link";
import { db } from "@/lib/db/client";
import { evaluationSuites, tools } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateSuiteForm } from "@/components/admin/evaluations/CreateSuiteForm";

export const metadata = { title: "Evaluaciones — Admin" };

export default async function AdminEvaluationsPage() {
  const suites = await db.select().from(evaluationSuites);
  const toolRows = await db.select({ id: tools.id, slug: tools.slug }).from(tools);
  const suitesWithTool = suites.map((suite) => ({ ...suite, toolSlug: toolRows.find((t) => t.id === suite.toolId)?.slug ?? suite.toolId }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Suites de evaluación</h1>
      <CreateSuiteForm tools={toolRows} />
      {suitesWithTool.length === 0 ? (
        <EmptyState title="No hay suites de evaluación todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {suitesWithTool.map((suite) => (
              <li key={suite.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link href={`/admin/evaluations/${suite.id}`} className="text-sm font-medium text-ink hover:underline">
                    {suite.name}
                  </Link>
                  <p className="text-xs text-ink-faint">{suite.toolSlug}</p>
                </div>
                {suite.isMandatoryForPublish === 1 && <Badge tone="warning">Obligatoria para publicar</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
