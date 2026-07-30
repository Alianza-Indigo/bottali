import { Building2 } from "lucide-react";
import {
  AdminPageHeader,
  AdminPanel,
  AdminTableFrame,
} from "@/components/admin/AdminPage";
import { CreateOrganizationForm } from "@/components/admin/organizations/CreateOrganizationForm";
import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { listAllOrganizations } from "@/lib/organizations/service";
import { ForbiddenError } from "@/lib/utils/errors";

export const metadata = { title: "Organizaciones" };

export default async function OrganizationsPage() {
  const { permissions } = await requireAdminAccess();
  if (!permissions.has("organizations.manage")) {
    throw new ForbiddenError("No tienes permiso para administrar organizaciones.");
  }
  const organizations = await listAllOrganizations();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Building2}
        title="Organizaciones"
        description="Tenants aislados que comparten la infraestructura de Bottali."
      />
      <AdminPanel title="Nueva organización">
        <CreateOrganizationForm />
      </AdminPanel>
      <AdminPanel title="Organizaciones" description={`${organizations.length} registradas`}>
        <AdminTableFrame>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Dominio</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizations.map((organization) => (
                <tr key={organization.id}>
                  <td className="px-3 py-3 font-medium text-ink">{organization.name}</td>
                  <td className="px-3 py-3 text-ink-muted">{organization.slug}</td>
                  <td className="px-3 py-3 text-ink-muted">
                    {organization.customDomain ?? "Sin dominio"}
                  </td>
                  <td className="px-3 py-3 text-ink-muted">{organization.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableFrame>
      </AdminPanel>
    </div>
  );
}
