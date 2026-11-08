const CACHE_NAME = 'aether-shell-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

async function precacheAppEntry(cache) {
  const index = await cache.match('/index.html');
  if (!index) throw new Error('The offline app shell is missing its index document.');

  const html = await index.text();
  const assets = [...html.matchAll(/["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  await cache.addAll(assets);
}

async function removeOutdatedBuildAssets() {
  const cache = await caches.open(CACHE_NAME);
  const index = await cache.match('/index.html');
  if (!index) throw new Error('The offline app shell is missing its index document.');

  const html = await index.text();
  const currentAssets = new Set([...html.matchAll(/["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]));
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/assets/') && !currentAssets.has(`${url.pathname}${url.search}`)) {
      await cache.delete(request);
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        await precacheAppEntry(cache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('aether-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(removeOutdatedBuildAssets)
      .then(() => self.clients.claim())
      .catch((error) => console.error('Could not update the offline app shell cache.', error))
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) ?? Response.error())
    );
    return;
  }

  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/fonts/')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const cached = (await cache.match(request)) ?? (await cache.match(url.pathname));
        return cached ?? Response.error();
      }
    })()
  );
});
