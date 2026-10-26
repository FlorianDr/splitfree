// splitfree service worker — deliberately minimal.
//
// This is an authenticated, server-rendered app, so the cardinal rule is: NEVER cache an HTML
// navigation. Doing so would serve one user's server-rendered page to another, show stale balances,
// or swallow a login redirect / Set-Cookie. We therefore:
//   - pass every navigation straight to the network (with an offline fallback page only),
//   - cache-first ONLY the content-hashed, immutable build assets under /assets/,
//   - ignore non-GET requests entirely, so WebAuthn/login POSTs are never touched.
//
// Its real job is to satisfy the "service worker with a fetch handler" leg of the install criteria
// and to give an offline fallback — not to be an offline-first cache.

const VERSION = "v1";
const CACHE = `splitfree-${VERSION}`;
const OFFLINE_URL = "/offline.html";
// Precache the offline page + its branding so the fallback renders with no network.
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intervene on same-origin GETs. POSTs (WebAuthn, form actions), cross-origin font
  // requests, etc. fall through to the network untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: always hit the network so SSR + auth stay correct; only fall back to the
  // offline page when the network is genuinely unreachable.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Content-hashed build output is immutable — safe to serve cache-first, populated on first use.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, manifest, favicon): network, falling back to any precached copy offline.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
