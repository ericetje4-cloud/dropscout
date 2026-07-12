// ===========================================================================
// Enregistrement du Service Worker (généré par vite-plugin-pwa) et gestion
// des mises à jour + état online/offline.
// ===========================================================================

import { registerSW } from 'virtual:pwa-register';

export interface PWAState {
  /** true quand une nouvelle version du SW attend d'être activée. */
  needRefresh: boolean;
  /** true quand le SW est actif (périphérique utilisable hors-ligne). */
  offlineReady: boolean;
  /** true quand l'app s'exécute installée (standalone). */
  isStandalone: boolean;
  /** true si le navigateur est actuellement hors-ligne. */
  isOffline: boolean;
}

type Listener = (state: PWAState) => void;

let state: PWAState = {
  needRefresh: false,
  offlineReady: false,
  isStandalone: isRunningStandalone(),
  isOffline: !navigator.onLine,
};

const listeners = new Set<Listener>();

function setState(patch: Partial<PWAState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

/** S'abonne aux changements d'état PWA. Retourne la fn de désabonnement. */
export function subscribePWA(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getPWAState(): PWAState {
  return state;
}

// ---------------------------------------------------------------------------
// Installation / mode standalone (PWA installée)
// ---------------------------------------------------------------------------

export function isRunningStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ---------------------------------------------------------------------------
// Enregistrement du Service Worker
// ---------------------------------------------------------------------------

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function setupPWA(): void {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setState({ needRefresh: true });
    },
    onOfflineReady() {
      setState({ offlineReady: true });
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Vérifie les mises à jour toutes les 30 minutes.
      setInterval(
        async () => {
          if (!navigator.onLine) return;
          try {
            await registration.update();
          } catch {
            /* ignore : offline temporaire */
          }
        },
        30 * 60 * 1000,
      );
    },
    onRegisterError(err) {
      console.error('[pwa] Échec de l\'enregistrement du Service Worker', err);
    },
  });

  window.addEventListener('online', () => setState({ isOffline: false }));
  window.addEventListener('offline', () => setState({ isOffline: true }));
}

/** Applique la mise à jour en attente : active le nouveau SW et recharge. */
export async function applyUpdate(): Promise<void> {
  if (updateSW) {
    await updateSW(true);
  } else {
    window.location.reload();
  }
}

/** Ignore la notification de mise à jour. */
export function dismissUpdate(): void {
  setState({ needRefresh: false });
}

/**
 * Vide tous les caches de l'application (Cache Storage) et désenregistre les
 * Service Workers. Les données IndexedDB sont préservées.
 */
export async function clearAppCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}
