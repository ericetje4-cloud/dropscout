// ===========================================================================
// Service Worker DropScout (injectManifest).
//
// Pré-cache les assets (Workbox) ET gère le rafraîchissement en arrière-plan
// de la veille via l'événement `periodicsync`. Envoie une notification locale
// quand des niches ont été actualisées.
// ===========================================================================

/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { refreshDueNiches, type RefreshResult } from '@/lib/refresh';

// `self` est un ServiceWorkerGlobalScope dans un SW. On le caste proprement :
// la lib "webworker" expose `self: WorkerGlobalScope`, mais le runtime SW y
// ajoute registration/clients/skipWaiting/etc. (interface ServiceWorkerGlobalScope).
const sw = self as unknown as ServiceWorkerGlobalScope;

// Pré-cache des assets (le manifeste est injecté par vite-plugin-pwa au build).
// NB : le littéral `self.__WB_MANIFEST` DOIT rester tel quel — Workbox le
// repère pour y injecter la liste des assets à pré-cacher.
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// ---------------------------------------------------------------------------
// Rafraîchissement en arrière-plan (Periodic Background Sync)
// ---------------------------------------------------------------------------

sw.addEventListener('periodicsync', ((event: PeriodicSyncEvent) => {
  if (event.tag !== 'niche-refresh') return;
  event.waitUntil(runBackgroundRefresh());
}) as EventListener);

async function runBackgroundRefresh(): Promise<void> {
  let result: RefreshResult;
  try {
    result = await refreshDueNiches();
  } catch (e) {
    console.error('[sw] rafraîchissement veille échoué', e);
    return;
  }

  // Notification seulement si quelque chose a effectivement été actualisé.
  if (result.refreshed.length > 0) {
    await notifyRefresh(result);
  }
}

async function notifyRefresh(result: RefreshResult): Promise<void> {
  const n = result.refreshed.length;
  const labels = result.refreshed.map((r) => r.label);
  const title = n === 1 ? `Veille actualisée : ${labels[0]}` : `${n} veilles actualisées`;

  const body =
    n === 1
      ? result.refreshed[0]!.label
      : labels.slice(0, 3).join(', ') + (n > 3 ? ` et ${n - 3} autre(s)` : '');

  try {
    await sw.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'niche-refresh',
      data: { url: '/' },
    });
  } catch (e) {
    console.error('[sw] notification échouée', e);
  }
}

// ---------------------------------------------------------------------------
// Clic sur une notification → focus / ouverture de l'app
// ---------------------------------------------------------------------------

sw.addEventListener('notificationclick', ((event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) ?? '/';

  event.waitUntil(
    (async () => {
      const all = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      if (sw.clients.openWindow) {
        await sw.clients.openWindow(targetUrl);
      }
    })(),
  );
}) as EventListener);

// ---------------------------------------------------------------------------
// Message depuis la fenêtre (test du refresh + skipWaiting)
// ---------------------------------------------------------------------------

sw.addEventListener('message', ((event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
  if (data?.type === 'TEST_REFRESH') {
    event.waitUntil(runBackgroundRefresh());
  }
}) as EventListener);
