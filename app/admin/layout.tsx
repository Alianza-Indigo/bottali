import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { AdminShell } from "@/components/layout/AdminShell";
import { listUserOrganizations } from "@/lib/organizations/service";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireAdminAccess();
  const organizations = await listUserOrganizations(session.id);
  return (
    <AdminShell
      user={{ email: session.email, displayName: session.displayName }}
      activeOrganization={session.organization}
      organizations={organizations.map(({ id, name, slug }) => ({ id, name, slug }))}
    >
      {children}
    </AdminShell>
  );
}
