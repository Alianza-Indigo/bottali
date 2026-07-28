import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireAdminAccess();
  return <AdminShell user={{ email: session.email, displayName: session.displayName }}>{children}</AdminShell>;
}
