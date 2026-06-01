const CACHE_NAME = "sonetpay-v20260601-pwa-popup-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=20260601-pwa-popup-v6",
  "./app.js?v=20260601-pwa-popup-v6",
  "./manifest.json?v=20260601-pwa-popup-v6",
  "./Public/Sonet.png",
  "./Public/icon-192.png?v=20260601-pwa-popup-v6",
  "./Public/icon-512.png?v=20260601-pwa-popup-v6"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event (Cleanup Old Caches)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network First or Cache Fallback)
self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If request is successful, clone it and put in cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network fails, serve from cache
        return caches.match(event.request);
      })
  );
});
