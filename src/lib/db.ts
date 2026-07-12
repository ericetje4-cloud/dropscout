// ===========================================================================
// Couche d'accès IndexedDB (offline-first, zéro réseau).
// Bibliothèque : idb (wrapper léger Promise-based).
//
// Object stores :
//   - products   : watchlist produits (keyPath "id", index status + niche)
//   - niches     : niches surveillées (keyPath "id")
//   - analyses   : historique des analyses IA (keyPath "id", index productId)
//   - shops      : boutiques connectées (keyPath "id", index platform)
//   - settings   : paramètres key-value (keyPath "key")
// ===========================================================================

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Analysis,
  Niche,
  Product,
  Setting,
  SettingKey,
  Shop,
} from '@/types';

const DB_NAME = 'dropscout';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_NICHES = 'niches';
const STORE_ANALYSES = 'analyses';
const STORE_SHOPS = 'shops';
const STORE_SETTINGS = 'settings';

/** Version logique du schéma d'export. */
export const BACKUP_SCHEMA_VERSION = 1;

interface DropScoutDB extends DBSchema {
  [STORE_PRODUCTS]: {
    key: string;
    value: Product;
    indexes: {
      'by-status': string;
      'by-niche': string;
      'by-updated': number;
    };
  };
  [STORE_NICHES]: {
    key: string;
    value: Niche;
  };
  [STORE_ANALYSES]: {
    key: string;
    value: Analysis;
    indexes: { 'by-product': string; 'by-date': number };
  };
  [STORE_SHOPS]: {
    key: string;
    value: Shop;
    indexes: { 'by-platform': string };
  };
  [STORE_SETTINGS]: {
    key: SettingKey;
    value: Setting;
  };
}

let dbPromise: Promise<IDBPDatabase<DropScoutDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DropScoutDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DropScoutDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const s = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
          s.createIndex('by-status', 'status');
          s.createIndex('by-niche', 'niche');
          s.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(STORE_NICHES)) {
          db.createObjectStore(STORE_NICHES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ANALYSES)) {
          const s = db.createObjectStore(STORE_ANALYSES, { keyPath: 'id' });
          s.createIndex('by-product', 'productId');
          s.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORE_SHOPS)) {
          const s = db.createObjectStore(STORE_SHOPS, { keyPath: 'id' });
          s.createIndex('by-platform', 'platform');
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      },
      blocked() {
        console.warn('[db] IndexedDB upgrade bloqué : fermez les autres onglets.');
      },
      terminated() {
        console.warn('[db] Connexion IndexedDB terminée inopinément.');
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export async function initDB(): Promise<void> {
  await getDB();
}

// ===========================================================================
// PRODUCTS
// ===========================================================================

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_PRODUCTS, 'by-updated');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProductsByStatus(status: Product['status']): Promise<Product[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_PRODUCTS, 'by-status', status);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const db = await getDB();
  return db.get(STORE_PRODUCTS, id);
}

export async function putProduct(p: Product): Promise<void> {
  const db = await getDB();
  await db.put(STORE_PRODUCTS, p);
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_PRODUCTS, id);
}

// ===========================================================================
// NICHES
// ===========================================================================

export async function getAllNiches(): Promise<Niche[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NICHES);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putNiche(n: Niche): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NICHES, n);
}

export async function deleteNiche(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NICHES, id);
}

// ===========================================================================
// ANALYSES
// ===========================================================================

export async function getAllAnalyses(): Promise<Analysis[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_ANALYSES, 'by-date');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAnalysesForProduct(productId: string): Promise<Analysis[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_ANALYSES, 'by-product', productId);
}

export async function putAnalysis(a: Analysis): Promise<void> {
  const db = await getDB();
  await db.put(STORE_ANALYSES, a);
}

export async function deleteAnalysis(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_ANALYSES, id);
}

// ===========================================================================
// SHOPS
// ===========================================================================

export async function getAllShops(): Promise<Shop[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_SHOPS);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putShop(s: Shop): Promise<void> {
  const db = await getDB();
  await db.put(STORE_SHOPS, s);
}

export async function deleteShop(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_SHOPS, id);
}

// ===========================================================================
// SETTINGS
// ===========================================================================

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<Setting<K>['value'] | undefined> {
  const db = await getDB();
  const row = await db.get(STORE_SETTINGS, key);
  return row?.value as Setting<K>['value'] | undefined;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: Setting<K>['value'],
): Promise<void> {
  const db = await getDB();
  const row: Setting<K> = { key, value, updatedAt: Date.now() };
  await db.put(STORE_SETTINGS, row);
}

export async function getAllSettings(): Promise<Setting[]> {
  const db = await getDB();
  return db.getAll(STORE_SETTINGS);
}

// ===========================================================================
// EXPORT / IMPORT
// ===========================================================================

import type { BackupPayload } from '@/types';

export async function exportDB(): Promise<BackupPayload> {
  const db = await getDB();
  const [products, niches, analyses, shops, settings] = await Promise.all([
    db.getAll(STORE_PRODUCTS),
    db.getAll(STORE_NICHES),
    db.getAll(STORE_ANALYSES),
    db.getAll(STORE_SHOPS),
    db.getAll(STORE_SETTINGS),
  ]);
  return {
    app: 'dropscout',
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    products,
    niches,
    analyses,
    shops,
    settings,
  };
}

export async function importDB(payload: BackupPayload, merge = true): Promise<void> {
  const db = await getDB();
  const stores = [
    STORE_PRODUCTS,
    STORE_NICHES,
    STORE_ANALYSES,
    STORE_SHOPS,
    STORE_SETTINGS,
  ] as const;

  const tx = db.transaction([...stores], 'readwrite');
  if (!merge) {
    await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  }
  await Promise.all([
    ...payload.products.map((p) => tx.objectStore(STORE_PRODUCTS).put(p)),
    ...payload.niches.map((n) => tx.objectStore(STORE_NICHES).put(n)),
    ...payload.analyses.map((a) => tx.objectStore(STORE_ANALYSES).put(a)),
    ...payload.shops.map((s) => tx.objectStore(STORE_SHOPS).put(s)),
    ...payload.settings.map((s) => tx.objectStore(STORE_SETTINGS).put(s)),
  ]);
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [STORE_PRODUCTS, STORE_NICHES, STORE_ANALYSES, STORE_SHOPS, STORE_SETTINGS],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore(STORE_PRODUCTS).clear(),
    tx.objectStore(STORE_NICHES).clear(),
    tx.objectStore(STORE_ANALYSES).clear(),
    tx.objectStore(STORE_SHOPS).clear(),
    tx.objectStore(STORE_SETTINGS).clear(),
  ]);
  await tx.done;
}
