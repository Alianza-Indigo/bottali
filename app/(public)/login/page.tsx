import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold text-ink">Iniciar sesión</h1>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}
        <form action="/api/v1/auth/google/start" method="get">
          <input name="next" type="hidden" value={destination} />
          <Button className="w-full" type="submit">
            Continuar con Google
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
