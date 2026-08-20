/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `meter-reader-${version}`;
const OFFLINE = "/offline.html";

/** The app shell: this build's own assets, which are hashed and so never go stale. */
const SHELL = [...build, ...files];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
    return;
  }

  // Every page is a live reading of the Meter, so it is the network or nothing — but a navigation
  // that finds nothing should land on a page rather than the browser's error.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()),
    );
  }
});

/** What the ingest service pushes when a Meter Event opens an Active Leak. */
interface LeakWarning {
  title: string;
  body: string;
  url: string;
}

const FALLBACK: LeakWarning = {
  title: "Your meter is reporting a leak",
  body: "Open the app to see what it is reporting.",
  url: "/",
};

function warning(event: PushEvent): LeakWarning {
  try {
    return { ...FALLBACK, ...(event.data?.json() as Partial<LeakWarning>) };
  } catch {
    return FALLBACK;
  }
}

sw.addEventListener("push", (event) => {
  const { title, body, url } = warning(event);
  event.waitUntil(
    // One tag per Meter, so a second warning about the same Meter replaces the first.
    sw.registration.showNotification(title, {
      body,
      data: { url },
      tag: url,
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

sw.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const target = new URL(url, sw.location.origin);
      const clients = await sw.clients.matchAll({ type: "window", includeUncontrolled: true });

      // The path, not the URL: a tab already on the Meter's page is the one to bring forward.
      const open = clients.find((client) => new URL(client.url).pathname === target.pathname);
      if (open) return open.focus();

      await sw.clients.openWindow(target.href);
    })(),
  );
});
