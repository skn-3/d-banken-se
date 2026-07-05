/* SmartKlimat push service worker */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "SmartKlimat", body: event.data && event.data.text() }; }
  const title = data.title || "SmartKlimat";
  const opts = {
    body: data.body || "",
    icon: "/smaarty/icon-192.png",
    badge: "/smaarty/badge.png",
    data: { url: data.url || "/saljare" },
    tag: data.tag || "smartklimat",
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if (c.url.includes(url)) { c.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
