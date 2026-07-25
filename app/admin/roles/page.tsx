import { ROLE_PERMISSIONS } from "@/lib/permissions/definitions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Roles — Admin" };

export default function AdminRolesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Roles y permisos</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Los roles del sistema son fijos; asigna roles a usuarios desde la sección Usuarios.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => (
          <Card key={role}>
            <CardHeader>
              <h2 className="text-sm font-semibold text-ink">{role}</h2>
            </CardHeader>
            <CardBody className="flex flex-wrap gap-1.5">
              {permissions.length === 0 ? (
                <span className="text-xs text-ink-faint">Sin permisos administrativos.</span>
              ) : (
                permissions.map((permission) => (
                  <Badge key={permission} tone="neutral">
                    {permission}
                  </Badge>
                ))
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
