/* EduFlow CRM — offline shell.
 * Rule of thumb: cache the CODE, never cache the DATA. Student records come
 * from localStorage (local mode) or api/index.php (team mode); both stay out of
 * the cache so a counsellor is never looking at yesterday's pipeline.
 */
const VERSION = "eduflow-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./app/app.js",
  "./app/config.js",
  "./app/seed.js",
  "./app/store.js",
  "./app/automation.js",
  "./app/ui.js",
  "./app/views.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;           // never touch wa.me, mailto, CDNs
  if (/^\/api\/|index\.php|seed\.json$/.test(url.pathname)) return;   // live data: always network

  // Navigation: network first so a deploy is visible on next reload, cache as the
  // offline fallback (branch office with a dead internet line still opens the CRM).
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || Response.redirect("./index.html", 0)))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
  if (e.data === "clear-data-cache") caches.keys().then((ks) => Promise.all(ks.filter((k) => /data/.test(k)).map((k) => caches.delete(k))));
});
