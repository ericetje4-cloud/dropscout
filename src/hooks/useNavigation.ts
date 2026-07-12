// ===========================================================================
// Navigation simple par hash routing (#/dashboard, #/watchlist...).
// ===========================================================================

import { useCallback, useEffect, useState } from 'react';

export type Route =
  | 'dashboard'
  | 'discover'
  | 'watchlist'
  | 'shops'
  | 'agent'
  | 'settings';

const ROUTES: Route[] = ['dashboard', 'discover', 'watchlist', 'shops', 'agent', 'settings'];
const DEFAULT_ROUTE: Route = 'dashboard';

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : DEFAULT_ROUTE;
}

export function useNavigation() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: Route) => {
    window.location.hash = `/${to}`;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  return { route, navigate };
}

export function navigateTo(route: Route): void {
  window.location.hash = `/${route}`;
}
