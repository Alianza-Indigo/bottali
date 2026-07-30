import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { toolBehavior, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canUserAccessTool } from "@/lib/tools/access";
import { Card, CardBody } from "@/components/ui/Card";
import { ToolMemorySettings } from "@/components/chat/ToolMemorySettings";

const MEMORY_MODE_LABELS: Record<string, string> = {
  DISABLED: "Desactivada",
  CONVERSATION_ONLY: "Solo en la conversación actual",
  SESSION_ONLY: "Solo durante la sesión",
  USER_APPROVED: "Con tu aprobación explícita",
  STRUCTURED: "Estructurada entre conversaciones",
  LONG_TERM: "Memoria de largo plazo",
};

export default async function ToolSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireCurrentUser();

  const toolRows = await db
    .select()
    .from(tools)
    .where(and(eq(tools.organizationId, user.organizationId), eq(tools.slug, slug)))
    .limit(1);
  const tool = toolRows[0];
  if (!tool || tool.status !== "PUBLISHED" || !tool.publishedVersionId) notFound();
  if (!(await canUserAccessTool(tool.id, user.id, user.organizationId))) redirect(`/tools/${slug}`);

  const [behavior] = await db.select().from(toolBehavior).where(eq(toolBehavior.toolVersionId, tool.publishedVersionId)).limit(1);
  const memoryMode = behavior?.memoryMode ?? "DISABLED";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Configuración de la herramienta</h1>
      <Card>
        <CardBody className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Memoria</h2>
            <p className="mt-1 text-sm text-ink">Modo configurado: {MEMORY_MODE_LABELS[memoryMode] ?? memoryMode}</p>
          </div>
          {memoryMode !== "DISABLED" && <ToolMemorySettings toolId={tool.id} />}
        </CardBody>
      </Card>
    </div>
  );
}
