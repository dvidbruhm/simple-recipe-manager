const CACHE = "recipe-manager-v2";
const SHELL = [
  "/static/app.css",
  "/static/htmx.min.js",
  "/manifest.webmanifest",
  "/login",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/shared-target") {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const link = formData.get("url") || formData.get("text") || "";
        return Response.redirect(`/import/shared?url=${encodeURIComponent(link)}`, 303);
      } catch {
        return Response.redirect("/recipes", 303);
      }
    })());
    return;
  }

  if (event.request.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        "<!DOCTYPE html><html><body><h1>Offline</h1><p>Cannot reach the Recipe Manager server.</p></body></html>",
        { status: 503, headers: { "Content-Type": "text/html" } }
      ))
    );
  }
});
