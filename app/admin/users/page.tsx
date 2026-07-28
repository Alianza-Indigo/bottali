import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { UserPlus, Users } from "lucide-react";
import { UsersTable } from "@/components/admin/users/UsersTable";
import { CreateUserForm } from "@/components/admin/users/CreateUserForm";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Users}
        title="Usuarios"
        description="Administra el acceso, estado y sesiones de las cuentas de la plataforma."
      />
      <AdminPanel title="Agregar usuarios" description="Crea una cuenta individual o importa varias de una sola vez." action={<UserPlus className="h-4 w-4 text-ink-faint" />}>
        <CreateUserForm />
      </AdminPanel>
      <AdminPanel title={`${rows.length} usuarios recientes`} description="Se muestran las 100 cuentas más recientes." contentClassName="">
        <UsersTable users={rows} />
      </AdminPanel>
    </div>
  );
}
