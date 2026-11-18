// BuildPath service worker: the app opens on a phone even with a bad connection. Pages and the API always come from the
// network — they are personal and change — and only the built static files, the icons and the offline page are cached.
const VERSION = "bp-2";
const OFFLINE = "/offline";

/** The offline page and the built files it needs, so it renders with no connection at all. */
async function keepOfflinePage() {
  const cache = await caches.open(VERSION);
  const response = await fetch(OFFLINE, { cache: "reload" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put(OFFLINE, response);
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1]))];
  await Promise.all(["/icon.svg", ...assets].map((asset) => cache.add(asset).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(keepOfflinePage().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    // Network first; without a connection, a short page that says so instead of the browser's error.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE).then((page) => page || Response.error())));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || /^\/icon[\w-]*\.svg$/.test(url.pathname)) {
    // Built files carry a hash in their name and never change: the cached copy is the right one.
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); void caches.open(VERSION).then((cache) => cache.put(request, copy)); }
      return response;
    })));
  }
});
