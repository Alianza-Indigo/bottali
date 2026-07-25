import "server-only";
import { getCurrentSession, type SessionUser } from "./session";
import { UnauthorizedError } from "@/lib/utils/errors";

export async function requireCurrentUser(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
