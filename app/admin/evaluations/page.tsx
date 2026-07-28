import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db/client";
import { evaluationSuites, tools } from "@/db/schema";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateSuiteForm } from "@/components/admin/evaluations/CreateSuiteForm";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Evaluaciones — Admin" };

export default async function AdminEvaluationsPage() {
  const suites = await db.select().from(evaluationSuites);
  const toolRows = await db.select({ id: tools.id, slug: tools.slug }).from(tools);
  const suitesWithTool = suites.map((suite) => ({ ...suite, toolSlug: toolRows.find((t) => t.id === suite.toolId)?.slug ?? suite.toolId }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={FlaskConical}
        title="Evaluaciones"
        description="Valida la calidad de cada herramienta con casos repetibles antes de publicarla."
      />
      <AdminPanel title="Nueva suite" description="Agrupa casos de prueba para una herramienta.">
        <CreateSuiteForm tools={toolRows} />
      </AdminPanel>
      {suitesWithTool.length === 0 ? (
        <EmptyState title="No hay suites de evaluación todavía" />
      ) : (
        <AdminPanel title={`${suitesWithTool.length} suites`} contentClassName="">
          <ul className="divide-y divide-border">
            {suitesWithTool.map((suite) => (
              <li key={suite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
        </AdminPanel>
      )}
    </div>
  );
}
