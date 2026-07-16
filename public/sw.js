/* Nouveau MMO RPG — application shell for offline play after the first online visit. */
const CACHE_PREFIX = "nouveau-mmo-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const CORE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/assets/characters/adventurier-marche-gauche.png",
];

function isCacheableUrl(value) {
  const url = new URL(value, self.location.origin);
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    (CORE_URLS.includes(url.pathname) ||
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/assets/"))
  );
}

async function cacheUrl(cache, value) {
  const url = new URL(value, self.location.origin);
  if (!isCacheableUrl(url.href)) return false;
  const key = url.pathname === "/" ? "/" : url.pathname + url.search;
  try {
    const response = await fetch(url.href, { cache: "reload", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Impossible de préparer ${url.pathname}`);
    await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function warmAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const page = await cacheUrl(cache, "/");
  if (!page) throw new Error("La page du jeu n'a pas pu être préparée.");
  const html = await page.text();
  const assetUrls = new Set(CORE_URLS.filter((url) => url !== "/"));
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/_next/")) {
      assetUrls.add(url.pathname + url.search);
    }
  }
  await Promise.all([...assetUrls].map((url) => cacheUrl(cache, url)));
}

async function prepareOfflineAssets(values) {
  const cache = await caches.open(CACHE_NAME);
  await warmAppShell();
  const urls = [...new Set(values)].filter(isCacheableUrl);
  await Promise.all(urls.map((url) => cacheUrl(cache, url)));
  return urls.length;
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE") return;
  const replyPort = event.ports[0];
  const task = prepareOfflineAssets(Array.isArray(event.data.urls) ? event.data.urls : [])
    .then((assetCount) => {
      replyPort?.postMessage({ type: "OFFLINE_CACHE_READY", assetCount, cacheName: CACHE_NAME });
    })
    .catch((error) => {
      replyPort?.postMessage({
        type: "OFFLINE_CACHE_ERROR",
        message: error instanceof Error ? error.message : "Préparation hors ligne impossible.",
      });
      throw error;
    });
  event.waitUntil(task);
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok && !/no-store/i.test(response.headers.get("Cache-Control") || "")) {
            await (await caches.open(CACHE_NAME)).put("/", response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  const cacheableAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:png|webp|svg|ico|woff2?)$/i.test(url.pathname);
  if (!cacheableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (response.ok && !/no-store/i.test(response.headers.get("Cache-Control") || "")) {
          await (await caches.open(CACHE_NAME)).put(request, response.clone());
        }
        return response;
      });
    }),
  );
});
