/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST || []);

registerRoute(
  ({ url }) => url.origin === 'https://generativelanguage.googleapis.com',
  new NetworkFirst({
    cacheName: 'gemini-api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 }),
    ],
  }),
);

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
