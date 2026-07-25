// Platform shell service worker.
//
// Scope constraints (spec §18): only the app shell, versioned static assets, public
// branding/icons, and the offline fallback page are ever cached. Auth/session state,
// API responses, conversations, and files are NEVER cached and are never intercepted —
// requests to /api/ and non-GET requests pass straight through to the network.
const SHELL_CACHE = "shell-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Deliberately no clients.claim() here: claiming the client that triggered this activation
  // would hand it a controller mid-load, racing its own still-in-flight resource requests and
  // risking a broken hydration. Standard, safe PWA behavior: this worker starts controlling
  // pages from the NEXT navigation onward, never the page that just registered it.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isNeverIntercepted(url) {
  // API responses, cron/webhook endpoints, and Next.js data payloads may carry
  // session-scoped or private data and must always hit the network fresh.
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isNeverIntercepted(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
