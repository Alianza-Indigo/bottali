import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobsList } from "@/components/admin/jobs/JobsList";

export const metadata = { title: "Trabajos — Admin" };

export default async function AdminJobsPage() {
  const rows = await db.select().from(backgroundJobs).orderBy(desc(backgroundJobs.createdAt)).limit(100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">Trabajos asíncronos</h1>
      {rows.length === 0 ? (
        <EmptyState title="No hay trabajos registrados" />
      ) : (
        <Card>
          <JobsList
            jobs={rows.map((j) => ({ id: j.id, type: j.type, status: j.status, attempt: j.attempt, maxAttempts: j.maxAttempts, errorMessage: j.errorMessage }))}
          />
        </Card>
      )}
    </div>
  );
}
