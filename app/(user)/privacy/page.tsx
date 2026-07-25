import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { legalDocuments } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card, CardBody } from "@/components/ui/Card";
import { ConsentToggles } from "@/components/privacy/ConsentToggles";
import { DataActions } from "@/components/privacy/DataActions";

export const metadata = { title: "Privacidad" };

export default async function PrivacyPage() {
  await requireCurrentUser();
  const [policy] = await db.select().from(legalDocuments).where(eq(legalDocuments.kind, "privacy_policy")).limit(1);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">Privacidad y datos</h1>

      {policy && (
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Aviso de privacidad</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink">{policy.content}</p>
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
