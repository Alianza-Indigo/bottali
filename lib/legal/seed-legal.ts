import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { legalDocuments } from "@/db/schema";

const DEFAULT_PRIVACY_POLICY = `Aviso de privacidad (plantilla inicial)

Esta plataforma procesa datos personales estrictamente necesarios para operar las
herramientas conversacionales que ofrece: identificación de cuenta, preferencias de
uso, contenido de las conversaciones y archivos que el usuario decida adjuntar.

Los administradores no pueden leer el contenido de las conversaciones por defecto;
hacerlo requiere un permiso explícito, queda registrado en auditoría y exige un
motivo documentado.

Este texto es una plantilla y debe ser reemplazado por el equipo legal de la
organización antes de operar con usuarios reales.`;

/** Idempotent: ensures at least one published privacy_policy document exists — required
 * by validateVersionForPublish (§7) for ANY tool to be publishable. Safe in production:
 * it only inserts a placeholder if none exists yet, never overwrites a real one. */
export async function seedDefaultLegalDocuments(db: Database): Promise<void> {
  const existing = await db.select({ id: legalDocuments.id }).from(legalDocuments).where(eq(legalDocuments.kind, "privacy_policy")).limit(1);
  if (existing.length > 0) return;
  await db.insert(legalDocuments).values({ kind: "privacy_policy", version: 1, content: DEFAULT_PRIVACY_POLICY });
}
