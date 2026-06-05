/**
 * Socia Service Worker — PWA offline support + asset caching.
 *
 * Strategy:
 *  - Static app shell (JS/CSS/HTML) → Cache-first, update in background.
 *  - API calls (/api/*) → Network-first, fall back to cache when offline.
 *  - Supabase calls → Network-only (auth-sensitive, never cache).
 *  - Media assets (images/video CDN) → Cache-first with size limit.
 */

const APP_SHELL_CACHE  = "socia-shell-v1";
const MEDIA_CACHE      = "socia-media-v1";
const API_CACHE        = "socia-api-v1";

const MAX_MEDIA_ENTRIES = 80;   /* cap cached media items */
const API_CACHE_SECONDS = 30;   /* how long to trust a cached API response */

/* ── Install: pre-cache the app shell ─────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.addAll(["/"])
    )
  );
  /* Activate immediately without waiting for old tabs to close */
  self.skipWaiting();
});

/* ── Activate: prune stale caches ─────────────────────────────────────── */
self.addEventListener("activate", (event) => {
  const keep = new Set([APP_SHELL_CACHE, MEDIA_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: route-based caching strategies ─────────────────────────────── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET, cross-origin auth (Supabase GoTrue), chrome-extension */
  if (request.method !== "GET") return;
  if (url.hostname.includes("supabase.co") && url.pathname.includes("/auth/")) return;
  if (request.url.startsWith("chrome-extension")) return;

  /* API: network-first with short-lived cache */
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, API_CACHE_SECONDS));
    return;
  }

  /* Media CDN (images / video): cache-first */
  if (
    url.hostname !== self.location.hostname &&
    (url.pathname.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|avif)$/i))
  ) {
    event.respondWith(cacheFirstMedia(request));
    return;
  }

  /* App shell & static assets: stale-while-revalidate */
  event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
});

/* ── Strategies ────────────────────────────────────────────────────────── */

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? fetchPromise ?? new Response("Offline", { status: 503 });
}

async function networkFirstWithCache(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const date = cached.headers.get("date");
      if (date) {
        const ageMs = Date.now() - new Date(date).getTime();
        if (ageMs < maxAgeSeconds * 1000) return cached;
      }
    }
    return cached ?? new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirstMedia(request) {
  const cache  = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  /* Trim cache if over limit */
  const keys = await cache.keys();
  if (keys.length >= MAX_MEDIA_ENTRIES) {
    await cache.delete(keys[0]);
  }

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("", { status: 408 });
  }
}

/* ── Push Notifications ────────────────────────────────────────────────── */

/**
 * push event — show a native notification when the server sends a push.
 *
 * Expected push payload (JSON):
 *   { title, body, icon?, badge?, url?, tag? }
 *
 * Falls back to a generic "Socia" notification if payload is unparseable.
 */
self.addEventListener("push", (event) => {
  let data = { title: "Socia", body: "You have a new notification." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* keep defaults */ }

  const options = {
    body:              data.body,
    icon:              data.icon  || "/icons/icon-192.png",
    badge:             data.badge || "/icons/icon-96.png",
    tag:               data.tag   || "socia-notification",
    data:              { url: data.url || "/" },
    vibrate:           [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/**
 * notificationclick — navigate to the notification's target URL and
 * focus an existing client window if one is already open.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      /* Prefer an already-open Socia tab */
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      /* No open tab — open a new one */
      return clients.openWindow(targetUrl);
    })
  );
});
