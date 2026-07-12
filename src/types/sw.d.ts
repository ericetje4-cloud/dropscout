// ===========================================================================
// Déclarations de types pour le Service Worker personnalisé (src/sw.ts).
// Compilé via tsconfig.sw.json (lib: WebWorker, sans DOM).
// ===========================================================================

// L'événement periodicsync n'est pas dans les lib TS standards.
interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

// Manifeste injecté par Workbox au build (littéral repéré par injectManifest).
interface WorkerGlobalScope {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
}
