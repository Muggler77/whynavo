const CACHE_NAME = "whynavo-shell-v0.9.6";
const ICON_CACHE_NAME = "whynavo-icons-v1";
const SHELL_CACHE_PREFIX = "whynavo-shell-v";
const MAX_SHELL_CACHE_VERSIONS = 2;
const MAX_ICON_CACHE_ENTRIES = 200;
const APP_SHELL = ["./", "./privacy.html", "./terms.html", "./LICENSE.txt", "./THIRD_PARTY_NOTICES.txt", "./asset-manifest.json", "./app.webmanifest?v=0.9.6", "./icons/icon192.png?v=0.9.6", "./wallpapers/photo/mobile/lucid-room.jpg"];
const ICON_HOSTS = new Set(["cdn.simpleicons.org", "icons.duckduckgo.com", "www.google.com"]);

const compareCacheVersions = (left, right) => {
  const parts = (value) => value.slice(SHELL_CACHE_PREFIX.length).split(".").map((entry) => Number.parseInt(entry, 10) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (rightParts[index] || 0) - (leftParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const [response, manifestResponse] = await Promise.all([
          fetch("./"),
          fetch("./asset-manifest.json")
        ]);
        if (!response.ok || !manifestResponse.ok) return;
        const [html, manifest] = await Promise.all([
          response.clone().text(),
          manifestResponse.json()
        ]);
        await cache.put("./", response);
        const htmlAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1]);
        const manifestAssets = Object.values(manifest || {}).flatMap((entry) => [
          entry?.file,
          ...(Array.isArray(entry?.css) ? entry.css : [])
        ]);
        const builtAssets = [...htmlAssets, ...manifestAssets]
          .filter((value) => typeof value === "string" && value.length <= 2048)
          .map((value) => new URL(value, self.location.href).href)
          .filter((url) => new URL(url).origin === self.location.origin);
        await Promise.all([...new Set(builtAssets)].map((url) => cache.add(url).catch(() => undefined)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const retainedCaches = new Set(
          keys
            .filter((key) => key.startsWith(SHELL_CACHE_PREFIX))
            .sort(compareCacheVersions)
            .slice(0, MAX_SHELL_CACHE_VERSIONS)
        );
        retainedCaches.add(CACHE_NAME);
        retainedCaches.add(ICON_CACHE_NAME);
        return Promise.all(keys.filter((key) => !retainedCaches.has(key)).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

const cacheExternalIcon = async (request) => {
  const cache = await caches.open(ICON_CACHE_NAME).catch(() => undefined);
  const cached = cache ? await cache.match(request).catch(() => undefined) : undefined;
  if (cached) return cached;

  const response = await fetch(request);
  if (cache && (response.ok || response.type === "opaque")) {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ICON_CACHE_ENTRIES)).map((key) => cache.delete(key)));
    } catch {
      // A full or unavailable cache must not turn a successful icon response into a failure.
    }
  }
  return response;
};

const matchCurrentThenPreviousShell = async (request) => {
  const currentCache = await caches.open(CACHE_NAME);
  const currentMatch = await currentCache.match(request);
  if (currentMatch) return currentMatch;

  const previousCacheNames = (await caches.keys())
    .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_NAME)
    .sort(compareCacheVersions);
  for (const cacheName of previousCacheNames) {
    const cached = await caches.open(cacheName).then((cache) => cache.match(request));
    if (cached) return cached;
  }
  return undefined;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (request.destination === "image" && ICON_HOSTS.has(url.hostname)) {
      event.respondWith(cacheExternalIcon(request));
    }
    return;
  }

  if (request.mode === "navigate") {
    if (url.pathname.endsWith("/captcha.html") || url.pathname.endsWith("/confirm.html")) {
      event.respondWith(fetch(request));
      return;
    }

    const isAppShell = url.pathname === "/" || url.pathname.endsWith("/index.html");
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            const cacheKey = isAppShell ? "./" : request;
            void caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(() => matchCurrentThenPreviousShell(isAppShell ? "./" : request))
    );
    return;
  }

  event.respondWith(
    matchCurrentThenPreviousShell(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ["script", "style", "image", "font"].includes(request.destination)) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
