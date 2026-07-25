import { requireCurrentUser } from "@/lib/auth/current-user";
import { requirePermission } from "./rbac";
import type { PermissionKey } from "./definitions";
import type { SessionUser } from "@/lib/auth/session";

/** Convenience for route handlers: authenticate, then check one server-side permission. */
export async function requireUserWithPermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireCurrentUser();
  await requirePermission(user.id, permission);
  return user;
}
