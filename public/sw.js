const CACHE_NAME = "asy-recruitment-pwa-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("asy-recruitment-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API, authentication, Supabase, or applicant data.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/functions/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/"));
      }
    })());
    return;
  }

  // Prefer the latest deployed frontend asset; use cached assets only when offline.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error("Frontend asset unavailable while offline.");
      }
    })());
  }
});


// Background Web Push: browser can wake this service worker even with the site closed.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* fallback to generic alert */ }
  const title = String(payload.title || "ASYLUM COMMUNITY").slice(0, 100);
  const body = String(payload.body || "A recruitment update is available.").slice(0, 200);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "https://asy-clan-recruitment-1h073y.v2.appdeploy.ai/resources/asylum-community-logo.png",
    tag: String(payload.tag || "asy-recruitment"),
    data: { url: typeof payload.url === "string" && /^\/\?open_application=[0-9a-f-]{36}$/i.test(payload.url) ? payload.url : "/" },
    renotify: true,
    requireInteraction: false
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const relative = event.notification.data?.url || "/";
    const target = new URL(relative, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        if (client.navigate) await client.navigate(target);
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
