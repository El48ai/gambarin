// Service worker sederhana — cukup agar app bisa di-Install (PWA).
// Sengaja tidak meng-cache /api supaya hasil AI selalu baru.
const CACHE = "el48-ai-image-v1";
const ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Jangan ganggu panggilan API atau gambar dari Replicate
  if (url.pathname.startsWith("/api") || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
