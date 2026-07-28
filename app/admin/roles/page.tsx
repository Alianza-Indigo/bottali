import { ROLE_PERMISSIONS } from "@/lib/permissions/definitions";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Roles — Admin" };

export default function AdminRolesPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={KeyRound}
        title="Roles y permisos"
        description="Consulta el alcance de cada rol. Las asignaciones se administran desde Usuarios."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => (
          <AdminPanel key={role} title={role} description={`${permissions.length} permisos`}>
            <div className="flex flex-wrap gap-1.5">
              {permissions.length === 0 ? (
                <span className="text-xs text-ink-faint">Sin permisos administrativos.</span>
              ) : (
                permissions.map((permission) => (
                  <Badge key={permission} tone="neutral">
                    {permission}
                  </Badge>
                ))
              )}
            </div>
          </AdminPanel>
        ))}
      </div>
    </div>
  );
}
