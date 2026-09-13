/**
 * Socia Service Worker — safe PWA caching.
 *
 * Important: HTML/navigation responses are NEVER cache-first. A stale index
 * can reference old Vite chunk filenames and cause a lazy route to become a
 * blank/black screen after a deployment.
 *
 * API and Supabase Auth are never served from the browser cache.
 * Hashed static assets are cached for fast repeat loads.
 */

const SHELL_CACHE = "socia-shell-v2";
const MEDIA_CACHE = "socia-media-v2";
const MAX_MEDIA_ENTRIES = 80;

self.addEventListener("install", (event) => {
  // Do not pre-cache `/`: the HTML must stay network-fresh after deployments.
  event.waitUntil(Promise.resolve());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, MEDIA_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol === "chrome-extension:") return;

  // Supabase Auth/data must always be fresh and authenticated.
  if (url.hostname.includes("supabase.co")) return;

  // API responses must never be cached by the service worker.
  if (url.pathname.startsWith("/api/")) return;

  // Browser navigation gets the newest HTML first. This is the critical fix
  // for stale Vite manifests/chunks and intermittent blank route screens.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  // External media: cache-first with a small bounded cache.
  if (
    url.hostname !== self.location.hostname &&
    url.pathname.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|avif)$/i)
  ) {
    event.respondWith(cacheFirstMedia(request));
    return;
  }

  // Vite's hashed JS/CSS/fonts/images are safe to cache.
  if (request.destination === "script" || request.destination === "style" ||
      request.destination === "font" || request.destination === "image" ||
      url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirstStatic(request));
  }
});

async function networkFirstDocument(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function cacheFirstMedia(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const keys = await cache.keys();
  if (keys.length >= MAX_MEDIA_ENTRIES) await cache.delete(keys[0]);

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("", { status: 408 });
  }
}

/* Push notifications */
self.addEventListener("push", (event) => {
  let data = { title: "Socia", body: "You have a new notification." };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-96.png",
      tag: data.tag || "socia-notification",
      data: { url: data.url || "/" },
      vibrate: [100, 50, 100],
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
