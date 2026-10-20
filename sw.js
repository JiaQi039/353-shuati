/* 离线缓存：应用外壳 + 题库。版本号变化后会自动清理旧缓存。 */
const VERSION = "qz353-v3";
const CORE = [
  "./",
  "./index.html",
  "./library.html",
  "./manifest.webmanifest",
  "./assets/styles.css?v=3",
  "./assets/store.js?v=3",
  "./assets/data.js?v=3",
  "./assets/ui.js?v=3",
  "./assets/practice.js?v=3",
  "./assets/exam.js?v=3",
  "./assets/library.js?v=3",
  "./assets/app.js?v=3",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];
const DATA = [
  "./data/manifest.json",
  "./data/imported/index.json",
  "./data/questions/epidemiology.json",
  "./data/questions/statistics.json",
  "./data/questions/social.json",
  "./data/questions/environmental.json",
  "./data/questions/occupational.json",
  "./data/questions/nutrition.json",
  "./data/questions/toxicology.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache => cache.addAll([...CORE, ...DATA]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(new URL("index.html", self.registration.scope).href))
    );
    return;
  }

  if (url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
