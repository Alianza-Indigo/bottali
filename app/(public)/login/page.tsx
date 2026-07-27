import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: "Cancelaste el acceso con Google.",
  google_failed: "No fue posible iniciar sesión con Google. Intenta nuevamente.",
  google_not_configured: "El acceso con Google aún no está configurado.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = sanitizeReturnPath(next);
  const googleHref = `/api/v1/auth/google/start?next=${encodeURIComponent(destination)}`;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Iniciar sesión</h1>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}
        <Link
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition-colors hover:opacity-90"
          href={googleHref}
        >
          Continuar con Google
        </Link>
      </CardBody>
    </Card>
  );
}
