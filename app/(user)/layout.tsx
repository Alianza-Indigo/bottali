import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return <AppShell displayName={session.displayName}>{children}</AppShell>;
}
