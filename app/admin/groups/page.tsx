import { isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/db/schema";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateGroupForm } from "@/components/admin/groups/CreateGroupForm";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Grupos — Admin" };

export default async function AdminGroupsPage() {
  const rows = await db.select().from(groups).where(isNull(groups.deletedAt));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={UsersRound}
        title="Grupos"
        description="Organiza usuarios para asignar acceso a herramientas y recursos de forma consistente."
      />
      <AdminPanel title="Nuevo grupo" description="Crea una unidad de acceso para tu organización.">
        <CreateGroupForm />
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No hay grupos todavía" />
      ) : (
        <AdminPanel title={`${rows.length} grupos`} contentClassName="">
          <ul className="divide-y divide-border">
            {rows.map((group) => (
              <li key={group.id} className="px-5 py-3">
                <p className="text-sm text-ink">{group.name}</p>
                {group.description && <p className="text-xs text-ink-faint">{group.description}</p>}
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
