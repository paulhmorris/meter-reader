/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

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
    sw.registration.showNotification(title, { body, data: { url }, tag: url, renotify: true }),
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
