import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolCapabilities, tools } from "@/db/schema";
import { canUserAccessTool } from "@/lib/tools/access";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

export type RuntimeCapability = "voiceInput" | "voiceOutput";

export async function requireToolRuntimeCapability(
  toolId: string,
  userId: string,
  organizationId: string,
  capability: RuntimeCapability,
): Promise<void> {
  const rows = await db
    .select({
      status: tools.status,
      publishedVersionId: tools.publishedVersionId,
    })
    .from(tools)
    .where(and(eq(tools.id, toolId), eq(tools.organizationId, organizationId)))
    .limit(1);
  const tool = rows[0];
  if (!tool) throw new NotFoundError("Herramienta no encontrada.");
  if (tool.status !== "PUBLISHED" || !tool.publishedVersionId) {
    throw new ForbiddenError("La herramienta no está publicada.");
  }
  if (!(await canUserAccessTool(toolId, userId, organizationId))) {
    throw new ForbiddenError("No tienes acceso a esta herramienta.");
  }

  const capabilityRows = await db
    .select({
      voiceInput: toolCapabilities.voiceInput,
      voiceOutput: toolCapabilities.voiceOutput,
    })
    .from(toolCapabilities)
    .where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId))
    .limit(1);
  if (!capabilityRows[0]?.[capability]) {
    throw new ForbiddenError("Esta función no está habilitada para la herramienta.");
  }
}
