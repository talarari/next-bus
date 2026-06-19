// Minimal service worker: enables installability and offline use of the app
// shell. Live data (bus.gov.il / Stride) is cross-origin and always hits the
// network. Same-origin assets are network-first so online users stay fresh
// (matching the ?v= cache-busting), with a cached fallback when offline.
const CACHE = "nextbus-__VERSION__";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/stops.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((r) => r || caches.match("./"))
      )
  );
});
