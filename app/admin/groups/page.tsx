import { isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateGroupForm } from "@/components/admin/groups/CreateGroupForm";

export const metadata = { title: "Grupos — Admin" };

export default async function AdminGroupsPage() {
  const rows = await db.select().from(groups).where(isNull(groups.deletedAt));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Grupos</h1>
      <CreateGroupForm />
      {rows.length === 0 ? (
        <EmptyState title="No hay grupos todavía" />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((group) => (
              <li key={group.id} className="px-5 py-3">
                <p className="text-sm text-ink">{group.name}</p>
                {group.description && <p className="text-xs text-ink-faint">{group.description}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
