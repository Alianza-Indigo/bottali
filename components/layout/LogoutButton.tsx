"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      await apiPost("/api/v1/auth/logout");
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <Button variant="ghost" size="sm" loading={loading} onClick={onClick} aria-label="Cerrar sesión">
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="hidden xl:inline">Cerrar sesión</span>
    </Button>
  );
}
