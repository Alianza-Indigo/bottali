"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";

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
    <Button variant="ghost" size="sm" loading={loading} onClick={onClick}>
      Cerrar sesión
    </Button>
  );
}
