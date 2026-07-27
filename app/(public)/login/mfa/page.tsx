import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MfaLoginForm } from "@/components/auth/MfaLoginForm";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Verificación en dos pasos</h1>
      </CardHeader>
      <CardBody>
        <MfaLoginForm destination={sanitizeReturnPath(next)} />
      </CardBody>
    </Card>
  );
}
