"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredEvent || dismissed) return null;

  const install = async () => {
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-between gap-3 bg-surface-raised px-4 py-3 text-sm text-ink shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-lg sm:border sm:border-border"
    >
      <span>Instala la plataforma para acceso rápido y notificaciones.</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setDismissed(true)}>
          Ahora no
        </Button>
        <Button size="sm" onClick={install}>
          Instalar
        </Button>
      </div>
    </div>
  );
}
