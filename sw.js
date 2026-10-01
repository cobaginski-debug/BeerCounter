// Service Worker der Strichliste
// - App-Dateien: zuerst aus dem Netz (damit Updates sofort ankommen), offline aus dem Cache.
// - Firebase-SDK vom CDN: versionierte Dateien, daher zuerst aus dem Cache.
// Die Live-Daten selbst laufen über die Firebase-Verbindung und werden hier nicht angefasst.

const CACHE = "strichliste-v1";
const FIREBASE_VERSION = "12.19.0"; // muss zur Version in app.js passen
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
const NETWORK_TIMEOUT_MS = 4000;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png",
];
const FIREBASE_FILES = ["firebase-app.js", "firebase-auth.js", "firebase-database.js"].map((file) => FIREBASE_CDN + file);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(APP_SHELL);
      // Das SDK ist optional vorab im Cache – wenn das CDN gerade nicht erreichbar ist, klappt es beim nächsten Laden.
      await Promise.all(FIREBASE_FILES.map((url) => cache.add(new Request(url, { mode: "cors" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.href.startsWith(FIREBASE_CDN)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {});
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    // Ohne Cache-Treffer weiter auf das Netz warten (bzw. dessen Fehler weitergeben).
    return cached || network;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
