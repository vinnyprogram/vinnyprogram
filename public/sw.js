// Minimal service worker - just handle offline gracefully
const CACHE = "insulationpro-v4";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Skip non-GET and non-http requests
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith("http")) return;
  
  // Skip API calls - always go to network
  if (e.request.url.includes("supabase.co")) return;
  if (e.request.url.includes("anthropic.com")) return;
  if (e.request.url.includes("googleapis.com")) return;

  // Network first, no caching - keeps app fast and always fresh
  e.respondWith(
    fetch(e.request).catch(() => {
      if (e.request.mode === "navigate") {
        return caches.match("/index.html")
          .then(r => r || new Response("Offline", {status: 503, headers: {"Content-Type":"text/plain"}}));
      }
      return new Response("", {status: 204, statusText: "No Content"});
    })
  );
});
