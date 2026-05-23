/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  createHandlerBoundToURL,
  type PrecacheEntry,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[];
};

precacheAndRoute(self.__WB_MANIFEST || []);

const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(new NavigationRoute(navigationHandler));

registerRoute(
  ({ url }: { url: URL }) => url.origin === 'https://api.openai.com',
  new NetworkFirst({
    cacheName: 'openai-api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 }),
    ],
  }),
);

let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

self.addEventListener('message', (event) => {
  const msg = event.data as { type: string; endAt?: number };

  if (msg.type === 'schedule-notification' && msg.endAt) {
    if (notificationTimeout) clearTimeout(notificationTimeout);

    const delay = msg.endAt - Date.now();
    if (delay <= 0) return;

    notificationTimeout = setTimeout(async () => {
      notificationTimeout = null;
      await self.registration.showNotification('Rest timer finished', {
        body: 'Tap to return to your workout.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'rest-timer-finished',
        data: { type: 'rest-timer' },
      });
    }, delay);
  }

  if (msg.type === 'cancel-notification') {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const data = event.notification.data as { type?: string } | undefined;
      const targetType = data?.type;

      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      let client: WindowClient | null = clientList[0] ?? null;
      if (!client) {
        client = await self.clients.openWindow('/');
      }

      if (client && 'focus' in client) {
        await client.focus();
      }

      const messageType =
        targetType === 'rest-timer' ? 'rest-timer-ring' : null;
      if (messageType) {
        const clientsToNotify = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        clientsToNotify.forEach((windowClient) => {
          windowClient.postMessage({ type: messageType });
        });
      }
    })(),
  );
});
