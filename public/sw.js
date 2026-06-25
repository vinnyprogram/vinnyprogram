const CACHE = "insulationpro-v1";

const SHELL = [
  "/",
  "/index.html",
];

// Install — cache the app shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener("fetch", e => {
  // Skip Supabase API calls — those need the network
  if(e.request.url.includes("supabase.co")) return;
  if(e.request.url.includes("googleapis.com")) return;
  if(e.request.url.includes("anthropic.com")) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache successful GET responses (app assets)
        if(e.request.method === "GET" && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(e.request).then(cached => {
          if(cached) return cached;
          // For navigation requests, return the app shell
          if(e.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
