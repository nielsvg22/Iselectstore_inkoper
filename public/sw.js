/* iSelectStore service worker — push, klik-navigatie en veilige caching.
 * Veiligheidsbeleid: er wordt NOOIT iets uit /api of een ingelogde pagina (HTML) gecachet.
 * Alleen onveranderlijke statische bestanden (/_next/static, iconen, merk, productbeelden) en de offline-pagina. */
const VERSION = "v2";
const STATIC_CACHE = `adh-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/brand/mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("adh-") && k !== STATIC_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/products/") || url.pathname.startsWith("/splash/"));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return; // altijd rechtstreeks naar het netwerk
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (req.mode === "navigate") {
    // Pagina's zijn persoonlijk: nooit cachen. Bij geen verbinding een neutrale offline-pagina tonen.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "iSelectStore", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "iSelectStore";
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || "deal",
        renotify: false,
        data: { url: data.url || "/", externalUrl: data.externalUrl || null },
        requireInteraction: false,
        timestamp: Date.now(),
      })
      .then(() => ack(true))
      .catch((e) => ack(false, String((e && e.message) || e)).then(() => { throw e; })),
  );
});

/* Meldt aan de server of de browser de melding echt heeft getoond (of waarom niet). Mislukt dit, dan blijft de melding zelf gewoon werken. */
async function ack(ok, error) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint));
    const endpointId = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    await fetch("/api/push/ack", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ endpointId, ok, error: error ? error.slice(0, 180) : undefined }), keepalive: true });
  } catch {
    /* negeren */
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  // Alleen paden binnen het portaal openen
  const target = new URL(raw.startsWith("/") ? raw : "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) return c.navigate(target).catch(() => self.clients.openWindow(target));
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
