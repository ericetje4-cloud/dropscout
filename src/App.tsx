// ===========================================================================
// App : racine. Initialise le store + PWA, branche le routing et les
// providers (Toasts). Affiche un splash le temps de l'init IndexedDB.
// ===========================================================================

import { useEffect, useState } from 'react';
import { initStore, useStore } from '@/hooks/useStore';
import { setupPWA } from '@/lib/pwa';
import { getSetting } from '@/lib/db';
import { setApiKey, setModel, DEFAULT_MODEL } from '@/lib/gemini';
import { setDisplayCurrency } from '@/lib/format';
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
      setupPWA();
      if (!cancelled) setInited(true);
    })();
    return () => {
      cancelled = true;
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
