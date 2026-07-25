import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserPermissions } from "./rbac";
import type { PermissionKey } from "./definitions";

const ANY_ADMIN_PERMISSION: PermissionKey[] = [
  "users.read",
  "tools.read",
  "knowledge.read",
  "providers.read",
  "analytics.read",
  "audit.read",
  "security.read",
  "settings.manage",
];

/** Server Component guard for the /admin subtree: redirects to /login if unauthenticated,
 * to /dashboard if authenticated but without any admin-scoped permission. Individual admin
 * pages/routes still enforce their own specific permission server-side — this is only the
 * coarse "can this user see the admin shell at all" check. */
export async function requireAdminAccess() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const permissions = await getUserPermissions(session.id);
  const hasAnyAdminPermission = ANY_ADMIN_PERMISSION.some((p) => permissions.has(p));
  if (!hasAnyAdminPermission) redirect("/dashboard");

  return { session, permissions };
}
