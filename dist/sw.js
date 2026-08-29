const CACHE = "ava-i-shell-v7.2.1";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-152.png",
  "/icons/icon-167.png",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      for (const asset of ASSETS) {
        try { await cache.add(asset); } catch (error) {
          console.warn("Ava SW could not precache", asset, error);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      // Never cache /c/<slug> under /index.html unless it is actually HTML.
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        await cache.put("/index.html", response.clone());
      }
      return response;
    }
  } catch {}

  const cached = await caches.match("/index.html");
  if (cached) return cached;

  const root = await caches.match("/");
  if (root) return root;

  return new Response(
    "<!doctype html><title>Ava I offline</title><p>Ava I está temporariamente offline. Recarregue quando a conexão voltar.</p>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  // Never cache API responses.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
