"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface JobRow {
  id: string;
  type: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  errorMessage: string | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  COMPLETED: "success",
  QUEUED: "neutral",
  RUNNING: "brand",
  RETRYING: "warning",
  FAILED: "danger",
  DEAD_LETTER: "danger",
  CANCELLED: "neutral",
};

export function JobsList({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const retry = async (id: string) => {
    setBusyId(id);
    try {
      await apiPost(`/api/v1/admin/jobs/${id}/retry`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y divide-border">
      {jobs.map((job) => (
        <li key={job.id} className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-sm text-ink">{job.type}</p>
            <p className="text-xs text-ink-faint">
              Intento {job.attempt}/{job.maxAttempts}
              {job.errorMessage ? ` · ${job.errorMessage}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge>
            {(job.status === "FAILED" || job.status === "DEAD_LETTER" || job.status === "CANCELLED") && (
              <Button size="sm" variant="secondary" loading={busyId === job.id} onClick={() => retry(job.id)}>
                Reintentar
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
