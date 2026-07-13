// ===========================================================================
// App : racine. Initialise le store + PWA, branche le routing et les
// providers (Toasts). Affiche un splash le temps de l'init IndexedDB.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import { initStore, useStore } from '@/hooks/useStore';
import { setupPWA } from '@/lib/pwa';
import { getSetting } from '@/lib/db';
import { setApiKey, setModel, DEFAULT_MODEL } from '@/lib/gemini';
import { setDisplayCurrency } from '@/lib/format';
import { refreshDueNiches } from '@/lib/refresh';
import { registerNicheRefresh } from '@/lib/background-sync';
import { primeProxyBaseCache } from '@/lib/aliexpress-api';
import { useNavigation } from '@/hooks/useNavigation';
import { ToastProvider } from '@/components/ui';
import { DashboardPage } from '@/pages/DashboardPage';
import { DiscoverPage } from '@/pages/DiscoverPage';
import { WatchlistPage } from '@/pages/WatchlistPage';
import { ShopsPage } from '@/pages/ShopsPage';
import { AgentPage } from '@/pages/AgentPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  const { ready } = useStore();
  const { route } = useNavigation();
  const [inited, setInited] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initStore();
      const key = await getSetting('geminiKey');
      if (key) setApiKey(key);
      const model = await getSetting('geminiModel');
      setModel(model ?? DEFAULT_MODEL);
      const currency = await getSetting('currency');
      if (currency) setDisplayCurrency(currency);
      // Pré-charge l'URL du proxy en cache synchrone (pour le fallback image
      // AliExpress qui ne peut pas être async dans un tag <img>).
      const proxyUrl = await getSetting('proxyUrl');
      if (proxyUrl) primeProxyBaseCache(proxyUrl);
      setupPWA();
      if (cancelled) return;
      setInited(true);

      // --- Veille automatique (3 couches) ---
      const autoRefresh = (await getSetting('autoRefreshEnabled')) ?? true; // activé par défaut

      if (autoRefresh) {
        // Couche 3 : Periodic Background Sync (arrière-plan réel, Chromium + installé).
        const hours = (await getSetting('refreshIntervalHours')) ?? 24;
        void registerNicheRefresh(hours * 60 * 60 * 1000).catch(() => {});

        // Couche 1 : catch-up silencieux à l'ouverture (garanti, tous navigateurs).
        void refreshDueNiches().catch((e) => console.warn('[veille] catch-up', e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Couche 2 : minuteur premier plan — re-vérifie périodiquement tant que
  // l'app est visible. Mis en pause quand elle passe en arrière-plan.
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    let active = false;

    async function start() {
      if (active) return;
      active = true;
      const enabled = (await getSetting('autoRefreshEnabled')) ?? true;
      if (!enabled) return;
      const hours = (await getSetting('refreshIntervalHours')) ?? 24;
      // Tick toutes les 10 min : peu coûteux (refreshDueNiches n'agit que sur les
      // niches dues ; les autres sont ignorées sans appel réseau).
      timerRef.current = window.setInterval(
        () => {
          if (document.visibilityState === 'visible') {
            void refreshDueNiches().catch(() => {});
          }
        },
        Math.min(hours * 60 * 60 * 1000, 10 * 60 * 1000),
      );
    }

    function stop() {
      active = false;
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    // (Re)démarre quand l'app redevient visible (revient au premier plan).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  if (!inited || !ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-brand-600 text-white">
          <span className="text-2xl">🔭</span>
        </div>
        <p className="text-sm text-slate-400">DropScout…</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      {renderRoute(route)}
    </ToastProvider>
  );
}

function renderRoute(route: ReturnType<typeof useNavigation>['route']) {
  switch (route) {
    case 'dashboard':
      return <DashboardPage />;
    case 'discover':
      return <DiscoverPage />;
    case 'watchlist':
      return <WatchlistPage />;
    case 'shops':
      return <ShopsPage />;
    case 'agent':
      return <AgentPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}
