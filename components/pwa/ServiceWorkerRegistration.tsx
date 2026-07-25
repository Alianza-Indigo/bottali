"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // The SW never calls clients.claim() (see sw.js), so "controllerchange" only ever fires
    // for a genuine update — an already-controlled page handing off to a newly activated
    // worker — never on a page's first, uncontrolled load. Safe to always reload once here.
    let reloadedOnce = false;
    const onControllerChange = () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    function register() {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setRegistration(reg);
          if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          // Offline support is progressive enhancement; a failed registration must not break the app.
        });
    }

    // Registering while the page is still loading lets clients.claim() take over mid-load and
    // intercept the page's own still-in-flight chunk requests, which can hang hydration
    // indefinitely. Deferring to the "load" event (web.dev's standard PWA guidance) guarantees
    // every critical resource is already fetched before the worker can claim this client.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-ink px-4 py-3 text-sm text-white"
    >
      <span>Hay una nueva versión de la plataforma disponible.</span>
      <button
        type="button"
        onClick={() => registration?.waiting?.postMessage("SKIP_WAITING")}
        className="rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20"
      >
        Actualizar ahora
      </button>
    </div>
  );
}
