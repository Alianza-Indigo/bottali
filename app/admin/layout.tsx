import { requireAdminAccess } from "@/lib/permissions/admin-guard";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminAccess();
  return <AdminShell>{children}</AdminShell>;
}
