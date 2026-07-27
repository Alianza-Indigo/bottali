import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { legalAcceptances, legalDocuments } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card, CardBody } from "@/components/ui/Card";
import { ConsentToggles } from "@/components/privacy/ConsentToggles";
import { DataActions } from "@/components/privacy/DataActions";

export const metadata = { title: "Privacidad" };

export default async function PrivacyPage() {
  const user = await requireCurrentUser();
  const [policy] = await db.select().from(legalDocuments).where(eq(legalDocuments.kind, "privacy_policy")).limit(1);
  const [acceptance] = await db
    .select({ acceptedAt: legalAcceptances.acceptedAt, version: legalDocuments.version })
    .from(legalAcceptances)
    .innerJoin(legalDocuments, eq(legalDocuments.id, legalAcceptances.legalDocumentId))
    .where(eq(legalAcceptances.userId, user.id))
    .orderBy(desc(legalAcceptances.acceptedAt))
    .limit(1);
  const acceptanceOutdated = !!(acceptance && policy && acceptance.version < policy.version);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Privacidad y datos</h1>

      {policy && (
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Aviso de privacidad</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink">{policy.content}</p>
            {acceptance ? (
              <p className="mt-3 text-xs text-ink-muted">
                Aceptaste la versión {acceptance.version} el {acceptance.acceptedAt.toLocaleDateString("es")}.
                {acceptanceOutdated && " El aviso se actualizó desde entonces (versión actual: " + policy.version + ")."}
              </p>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">Aún no hay un registro de aceptación de este aviso para tu cuenta.</p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Consentimientos</h2>
          <ConsentToggles />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">Tus datos</h2>
          <DataActions />
        </CardBody>
      </Card>
    </div>
  );
}
