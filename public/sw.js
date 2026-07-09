// InsulationPro service worker — app-shell caching for field use with no signal.
//
// Strategy:
//  - Navigation requests (loading the app itself): network-first, falling back
//    to the cached shell when offline. This keeps the app fresh whenever
//    there's signal, but still lets it OPEN with zero signal.
//  - Same-origin static assets (JS/CSS/images under /assets, icons, manifest):
//    cache-first. Safe to cache aggressively because Vite content-hashes these
//    filenames on every build — a new deploy means new filenames, so this can
//    never serve stale app code by mistake.
//  - Cross-origin requests (Supabase API calls, etc.) are never cached — they
//    pass straight through to the network. Offline data writes are handled by
//    the app's own offline queue (src/utils/offlineQueue.js), not this SW.
//  - Old cache versions are wiped on activate so this never grows unbounded
//    or serves assets from a previous deploy.

const CACHE_VERSION = "v4";
const CACHE_NAME = `insulationpro-shell-${CACHE_VERSION}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin (Supabase, etc.)

  // Last-resort synthetic response so respondWith() never receives
  // undefined (which throws "Failed to convert value to 'Response'")
  // when there's genuinely nothing cached to fall back to yet - e.g.
  // the very first ever load, offline, before anything's been cached.
  const offlineFallback = () => new Response(
    "Offline and nothing cached yet for this page.",
    { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain" } }
  );

  // Navigations: network-first, cache fallback (keeps app fresh, still opens offline)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || offlineFallback()))
    );
    return;
  }

  // Static assets: cache-first, then network (and store for next time)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || offlineFallback());
    })
  );
});
