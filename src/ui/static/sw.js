const CACHE = "recipe-manager-v3";
const SHELL = [
  "/static/app.css",
  "/static/htmx.min.js",
  "/manifest.webmanifest",
  "/login",
];

const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline · Recipe Manager</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: var(--color-bg); color: var(--color-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .card { max-width: 28rem; text-align: center; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 2rem 1.5rem; }
  .card h1 { margin: 0.5rem 0 0.75rem; font-size: 1.25rem; }
  .card p { margin: 0 0 1.25rem; color: var(--color-muted); font-size: 0.9rem; line-height: 1.5; }
  .card a.btn, .card button.btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; background: var(--color-accent); color: #fff; text-decoration: none; border: none; border-radius: 4px; font: inherit; font-weight: 500; cursor: pointer; }
  .card img { width: 56px; height: 56px; }
</style>
</head>
<body>
  <div class="card">
    <img src="/static/favicon.svg" alt="">
    <h1>You're offline</h1>
    <p>Recipe Manager can't reach the server. Reconnect to keep browsing, editing, and cooking your recipes.</p>
    <button type="button" class="btn" onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

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
      .then(() => self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        for (const c of clients) {
          c.postMessage({ type: "sw-activated" });
        }
      }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
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

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return resp;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { "Content-Type": "text/html" },
          }))
        )
    );
    return;
  }

  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }))
    );
  }
});
