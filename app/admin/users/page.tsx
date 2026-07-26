import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { UsersTable } from "@/components/admin/users/UsersTable";
import { CreateUserForm } from "@/components/admin/users/CreateUserForm";

export const metadata = { title: "Usuarios — Admin" };

export default async function AdminUsersPage() {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      displayName: userProfiles.displayName,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Usuarios</h1>
      <CreateUserForm />
      <Card>
        <UsersTable users={rows} />
      </Card>
    </div>
  );
}
