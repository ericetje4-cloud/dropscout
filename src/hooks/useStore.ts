// ===========================================================================
// Store applicatif central : état React partagé alimenté par IndexedDB.
// Singleton module-level + hook useSyncExternalStore. Zéro réseau.
// ===========================================================================

import { useSyncExternalStore } from 'react';
import {
  clearAllData,
  deleteAnalysis as dbDeleteAnalysis,
  deleteNiche as dbDeleteNiche,
  deleteProduct as dbDeleteProduct,
  deleteShop as dbDeleteShop,
  exportDB,
  getAllAnalyses,
  getAllNiches,
  getAllProducts,
  getAllShops,
  importDB,
  initDB,
  putAnalysis as dbPutAnalysis,
  putNiche as dbPutNiche,
  putProduct as dbPutProduct,
  putShop as dbPutShop,
} from '@/lib/db';
import type { Analysis, Niche, Product, Shop } from '@/types';

export interface StoreState {
  ready: boolean;
  products: Product[];
  niches: Niche[];
  analyses: Analysis[];
  shops: Shop[];
}

const emptyState: StoreState = {
  ready: false,
  products: [],
  niches: [],
  analyses: [],
  shops: [],
};

let state: StoreState = emptyState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): StoreState {
  return state;
}

let initStarted = false;

export async function initStore(): Promise<void> {
  if (initStarted || state.ready) return;
  initStarted = true;
  await initDB();
  const [products, niches, analyses, shops] = await Promise.all([
    getAllProducts(),
    getAllNiches(),
    getAllAnalyses(),
    getAllShops(),
  ]);
  setState({ ready: true, products, niches, analyses, shops });
}

// ---------------------------------------------------------------------------
// Rechargements partiels
// ---------------------------------------------------------------------------

async function reloadProducts() {
  setState({ products: await getAllProducts() });
}
async function reloadNiches() {
  setState({ niches: await getAllNiches() });
}
async function reloadAnalyses() {
  setState({ analyses: await getAllAnalyses() });
}
async function reloadShops() {
  setState({ shops: await getAllShops() });
}

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export async function addProduct(data: NewProduct): Promise<Product> {
  const now = Date.now();
  const p: Product = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await dbPutProduct(p);
  await reloadProducts();
  return p;
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = state.products.find((p) => p.id === id);
  if (!existing) return;
  await dbPutProduct({ ...existing, ...patch, updatedAt: Date.now() });
  await reloadProducts();
}

export async function removeProduct(id: string): Promise<void> {
  await dbDeleteProduct(id);
  await reloadProducts();
}

// ---------------------------------------------------------------------------
// NICHES
// ---------------------------------------------------------------------------

export type NewNiche = Omit<Niche, 'id' | 'createdAt' | 'updatedAt'>;

export async function addNiche(data: NewNiche): Promise<Niche> {
  const now = Date.now();
  const n: Niche = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await dbPutNiche(n);
  await reloadNiches();
  return n;
}

export async function updateNiche(
  id: string,
  patch: Partial<Omit<Niche, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = state.niches.find((n) => n.id === id);
  if (!existing) return;
  await dbPutNiche({ ...existing, ...patch, updatedAt: Date.now() });
  await reloadNiches();
}

export async function removeNiche(id: string): Promise<void> {
  await dbDeleteNiche(id);
  await reloadNiches();
}

// ---------------------------------------------------------------------------
// ANALYSES
// ---------------------------------------------------------------------------

export type NewAnalysis = Omit<Analysis, 'id' | 'createdAt'>;

export async function addAnalysis(data: NewAnalysis): Promise<Analysis> {
  const a: Analysis = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
  await dbPutAnalysis(a);
  await reloadAnalyses();
  return a;
}

export async function removeAnalysis(id: string): Promise<void> {
  await dbDeleteAnalysis(id);
  await reloadAnalyses();
}

// ---------------------------------------------------------------------------
// SHOPS
// ---------------------------------------------------------------------------

export type NewShop = Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>;

export async function addShop(data: NewShop): Promise<Shop> {
  const now = Date.now();
  const s: Shop = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await dbPutShop(s);
  await reloadShops();
  return s;
}

export async function updateShop(
  id: string,
  patch: Partial<Omit<Shop, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = state.shops.find((s) => s.id === id);
  if (!existing) return;
  await dbPutShop({ ...existing, ...patch, updatedAt: Date.now() });
  await reloadShops();
}

export async function removeShop(id: string): Promise<void> {
  await dbDeleteShop(id);
  await reloadShops();
}

// ---------------------------------------------------------------------------
// EXPORT / IMPORT / RESET
// ---------------------------------------------------------------------------

export async function exportStore() {
  return exportDB();
}

export async function importStore(
  payload: Parameters<typeof importDB>[0],
  merge = true,
): Promise<void> {
  await importDB(payload, merge);
  await initStore();
}

export async function resetStore(): Promise<void> {
  await clearAllData();
  await Promise.all([reloadProducts(), reloadNiches(), reloadAnalyses(), reloadShops()]);
}

// ---------------------------------------------------------------------------
// HOOK REACT
// ---------------------------------------------------------------------------

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
