// ===========================================================================
// Inscription & diagnostic du Periodic Background Sync (couche 3).
//
// Periodic Sync permet au Service Worker de se réveiller périodiquement, même
// app fermée, pour rafraîchir la veille. Supporté uniquement sur Chromium
// (Chrome/Edge) ET si la PWA est installée. Feature-detect à l'exécution :
// partout ailleurs, les couches 1 (catch-up) et 2 (foreground) prennent le relais.
// ===========================================================================

/** Tag du periodic sync (identifiant unique pour notre tâche de veille). */
export const NICHE_REFRESH_TAG = 'niche-refresh';

export interface AutoRefreshStatus {
  /** true si Periodic Background Sync est supporté par ce navigateur. */
  periodicSyncSupported: boolean;
  /** true si l'app est installée (mode standalone). */
  installed: boolean;
  /** true si les notifications sont autorisées. */
  notificationPermission: NotificationPermission;
  /** true si l'inscription du periodic sync a réussi. */
  registered: boolean;
}

/**
 * Détecte le support du Periodic Background Sync.
 * Nécessite : Service Worker + 'periodicSync' sur ServiceWorkerRegistration.
 */
export function isPeriodicSyncSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'periodicSync' in ServiceWorkerRegistration.prototype
  );
}

/** true si l'app tourne en mode standalone (installée). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Tente d'inscrire le periodic sync pour la veille.
 * @param minIntervalMs intervalle minimum entre deux réveils (le navigateur peut
 *        espacer davantage selon batterie/usage).
 * @returns true si l'inscription a réussi.
 */
export async function registerNicheRefresh(
  minIntervalMs: number,
): Promise<boolean> {
  if (!isPeriodicSyncSupported()) return false;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      periodicSync?: {
        register: (tag: string, opts?: { minInterval?: number }) => Promise<void>;
      };
    };
    if (!reg.periodicSync) return false;
    await reg.periodicSync.register(NICHE_REFRESH_TAG, { minInterval: minIntervalMs });
    return true;
  } catch {
    // Souvent : PWA non installée ou permission refusée. Non fatal.
    return false;
  }
}

/** Désinscrit le periodic sync (quand l'utilisateur désactive la veille auto). */
export async function unregisterNicheRefresh(): Promise<void> {
  if (!isPeriodicSyncSupported()) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      periodicSync?: { unregister: (tag: string) => Promise<boolean> };
    };
    await reg.periodicSync?.unregister(NICHE_REFRESH_TAG);
  } catch {
    // ignore
  }
}

/**
 * Demande la permission de notifications (si pas déjà accordée).
 * À appeler au moment où l'utilisateur active la veille (pas au démarrage).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

/** Renvoie un diagnostic complet pour l'UI (Réglages → Veille auto). */
export async function getAutoRefreshStatus(): Promise<AutoRefreshStatus> {
  const periodicSyncSupported = isPeriodicSyncSupported();
  const installed = isInstalled();
  const notificationPermission: NotificationPermission =
    'Notification' in window ? Notification.permission : 'denied';

  let registered = false;
  if (periodicSyncSupported) {
    try {
      const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
        periodicSync?: { getTags: () => Promise<string[]> };
      };
      const tags = (await reg.periodicSync?.getTags?.()) ?? [];
      registered = tags.includes(NICHE_REFRESH_TAG);
    } catch {
      registered = false;
    }
  }

  return { periodicSyncSupported, installed, notificationPermission, registered };
}

/**
 * Renvoie un message explicite sur ce qui marchera sur cet appareil.
 * Pour aider l'utilisateur à comprendre pourquoi le rafraîchissement
 * arrière-plan peut être indisponible.
 */
export function explainStatus(status: AutoRefreshStatus): string {
  if (!status.periodicSyncSupported) {
    return "Ce navigateur ne supporte pas le rafraîchissement en arrière-plan. " +
      'La veille s\'actualisera à l\'ouverture de l\'app et tant qu\'elle reste ouverte. ' +
      '(Installez l\'app sur Chrome ou Edge pour le mode arrière-plan.)';
  }
  if (!status.installed) {
    return 'Pour le rafraîchissement en arrière-plan, installez l\'app sur votre écran d\'accueil. ' +
      'En attendant, la veille s\'actualise à l\'ouverture et en premier plan.';
  }
  if (status.notificationPermission !== 'granted') {
    return 'Le rafraîchissement arrière-plan est actif, mais les notifications sont désactivées. ' +
      'Autorisez-les pour être prévenu des nouveautés.';
  }
  return '✅ Rafraîchissement arrière-plan actif. Vous serez notifié des nouveautés.';
}
