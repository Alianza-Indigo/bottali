import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <Card>
      <CardBody className="flex flex-col gap-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-ink">Plataforma de Herramientas Conversacionales</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Crea, configura y opera asistentes de inteligencia artificial para tu organización.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/login">
            <Button className="w-full">Iniciar sesión</Button>
          </Link>
          <Link href="/register">
            <Button variant="secondary" className="w-full">
              Crear cuenta
            </Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
