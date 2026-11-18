/* Stone Dam Trail Guide service worker: makes the guide work offline on the trail. */
const VERSION = "sdtg-v2";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/i18n/es.js", "/i18n/zh.js", "/i18n/vi.js", "/i18n/ar.js", "/i18n/hi.js", "/i18n/te.js",
  "/media/welcome-poster.jpg",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png", "/icons/apple-touch-icon.png"
];
// The welcome video is large; cache it in the background so a slow connection
// never blocks installing the offline shell.
const EXTRA = ["/media/welcome.mp4"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    c.addAll(EXTRA).catch(() => {});
  })());
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Serve video byte ranges from a cached full response (needed for <video> seeking, especially on iOS).
async function rangeResponse(req, res) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: cache on first use so the typeface survives offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return; // always live

  // Page navigations: network first so updates arrive, cached copy when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put("/", res.clone());
        return res;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Video: serve ranges from cache when available.
  if (url.pathname === "/media/welcome.mp4") {
    e.respondWith((async () => {
      const hit = await caches.match(url.pathname);
      if (hit) return req.headers.has("range") ? rangeResponse(req, hit) : hit;
      return fetch(req);
    })());
    return;
  }

  // Everything else: network first so updates show up right away; cached copy when offline.
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch {
      return (await c.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});
