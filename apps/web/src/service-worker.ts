/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Precaches the built app shell so the board (and its last-cached PR data in
// localStorage) still loads with no network at all, not just when the
// GitHub/GitLab API is slow or unreachable.

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `review365-${version}`;
const ASSETS = new Set([...build, ...files]);

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(build))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Only the app's own shell/assets are cached; API calls to GitHub/GitLab
  // pass straight through (they carry per-user auth and are handled by the
  // app's own localStorage snapshot when offline).
  if (url.origin !== sw.location.origin) return;

  async function respond(): Promise<Response> {
    const cache = await caches.open(CACHE);

    if (ASSETS.has(url.pathname)) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
    }

    try {
      const response = await fetch(event.request);
      if (response.status === 200) cache.put(event.request, response.clone());
      return response;
    } catch (err) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw err;
    }
  }

  event.respondWith(respond());
});
