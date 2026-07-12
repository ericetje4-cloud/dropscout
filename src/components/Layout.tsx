// ===========================================================================
// Layout applicatif : en-tête, navigation (bottom-bar mobile), indicateur
// offline, notification de mise à jour PWA.
// ===========================================================================

import { type ReactNode } from 'react';
import {
  LayoutDashboard,
  Telescope,
  Star,
  Store,
  Settings,
  RefreshCw,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { Icon } from './Icon';
import { useNavigation, type Route } from '@/hooks/useNavigation';
import { useTheme } from '@/hooks/useTheme';
import { applyUpdate, subscribePWA, getPWAState } from '@/lib/pwa';
import { useSyncExternalStore } from 'react';

const NAV_ITEMS: { route: Route; label: string; icon: typeof Star }[] = [
  { route: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
  { route: 'discover', label: 'Découvrir', icon: Telescope },
  { route: 'watchlist', label: 'Watchlist', icon: Star },
  { route: 'agent', label: 'Agent', icon: Sparkles },
  { route: 'shops', label: 'Boutiques', icon: Store },
  { route: 'settings', label: 'Réglages', icon: Settings },
];

export function Layout({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  const { route, navigate } = useNavigation();
  const { resolved, toggle } = useTheme();

  const pwaState = useSyncExternalStore(
    subscribePWAReact,
    getPWAStateReact,
    getPWAStateReact,
  );

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Icon name="Telescope" size={18} />
            </div>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Basculer le thème"
              title="Thème : clair / sombre"
            >
              <Icon name={resolved === 'dark' ? 'Sun' : 'Moon'} size={18} />
            </button>
          </div>
        </div>
      </header>

      {pwaState.isOffline && (
        <div className="mx-auto flex max-w-3xl items-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <WifiOff size={15} /> Mode hors-ligne — vos données restent accessibles.
        </div>
      )}

      {pwaState.needRefresh && (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 bg-brand-600 px-4 py-2.5 text-sm text-white">
          <span className="flex items-center gap-2">
            <RefreshCw size={15} /> Une mise à jour est disponible.
          </span>
          <button
            onClick={() => applyUpdate()}
            className="rounded-lg bg-white/20 px-3 py-1 font-medium hover:bg-white/30"
          >
            Mettre à jour
          </button>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/90 sm:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV_ITEMS.map((item) => {
            const active = route === item.route;
            return (
              <button
                key={item.route}
                onClick={() => navigate(item.route)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                  active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'
                }`}
              >
                <item.icon size={20} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

import type { PWAState } from '@/lib/pwa';
function subscribePWAReact(cb: () => void): () => void {
  return subscribePWA(() => cb());
}
function getPWAStateReact(): PWAState {
  return getPWAState();
}
