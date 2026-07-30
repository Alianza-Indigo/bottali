import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { canAccessAdminPanel } from "@/lib/permissions/admin-guard";
import { listUserOrganizations } from "@/lib/organizations/service";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const canAccessAdmin = await canAccessAdminPanel(session.id, session.organizationId);
  const organizations = await listUserOrganizations(session.id);

  return (
    <AppShell
      displayName={session.displayName}
      canAccessAdmin={canAccessAdmin}
      activeOrganization={session.organization}
      organizations={organizations.map(({ id, name, slug }) => ({ id, name, slug }))}
    >
      {children}
    </AppShell>
  );
}
