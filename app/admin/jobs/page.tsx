import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { ListRestart } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobsList } from "@/components/admin/jobs/JobsList";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";

export const metadata = { title: "Trabajos — Admin" };

export default async function AdminJobsPage() {
  const rows = await db.select().from(backgroundJobs).orderBy(desc(backgroundJobs.createdAt)).limit(100);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={ListRestart}
        title="Trabajos asíncronos"
        description="Monitorea procesos en segundo plano, sus intentos y posibles errores."
      />
      {rows.length === 0 ? (
        <EmptyState title="No hay trabajos registrados" />
      ) : (
        <AdminPanel title={`${rows.length} trabajos recientes`} description="Se muestran los últimos 100 procesos." contentClassName="">
          <JobsList
            jobs={rows.map((j) => ({ id: j.id, type: j.type, status: j.status, attempt: j.attempt, maxAttempts: j.maxAttempts, errorMessage: j.errorMessage }))}
          />
        </AdminPanel>
      )}
    </div>
  );
}
