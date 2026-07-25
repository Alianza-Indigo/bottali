"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface UserRow {
  id: string;
  email: string;
  status: string;
  displayName: string | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  PENDING_VERIFICATION: "warning",
  SUSPENDED: "warning",
  BLOCKED: "danger",
  DELETED: "danger",
};

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (userId: string, action: "suspend" | "reactivate" | "block") => {
    setBusyId(`${userId}:${action}`);
    setError(null);
    try {
      await apiPost(`/api/v1/admin/users/${userId}/${action}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No fue posible completar la acción.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="p-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-border">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm text-ink">{user.displayName ?? user.email}</p>
              <p className="text-xs text-ink-faint">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>{user.status}</Badge>
              {user.status === "ACTIVE" && (
                <Button size="sm" variant="ghost" loading={busyId === `${user.id}:suspend`} onClick={() => act(user.id, "suspend")}>
                  Suspender
                </Button>
              )}
              {user.status === "SUSPENDED" && (
                <Button size="sm" variant="ghost" loading={busyId === `${user.id}:reactivate`} onClick={() => act(user.id, "reactivate")}>
                  Reactivar
                </Button>
              )}
              {user.status !== "BLOCKED" && user.status !== "DELETED" && (
                <Button size="sm" variant="danger" loading={busyId === `${user.id}:block`} onClick={() => act(user.id, "block")}>
                  Bloquear
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
