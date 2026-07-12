// ===========================================================================
// Client API boutiques : parle au proxy Cloudflare Worker (Pilier B).
//
// Le proxy relaie vers Shopify Admin API ou WooCommerce REST, en gérant CORS
// et en gardant les tokens hors du bundle navigateur. Voir proxy/worker.js.
// ===========================================================================

import { getSetting } from '@/lib/db';
import type { Shop } from '@/types';

/** Récupère l'URL du proxy depuis les settings. */
async function proxyBase(): Promise<string> {
  const url = (await getSetting('proxyUrl')) ?? '';
  return url.replace(/\/$/, '');
}

export class ShopApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ShopApiError';
    this.status = status;
  }
}

export interface RemoteProduct {
  id: string | number;
  title: string;
  status?: string;
  variants?: { price?: string; inventory_quantity?: number; sku?: string }[];
  images?: { src?: string }[];
}

/** En-tête d'authentification pour le proxy (token chiffré côté client). */
function authHeaders(shop: Shop): Record<string, string> {
  // On envoie les credentials dans des headers dédiés que le proxy lit,
  // puis les retire avant de relayer vers la plateforme.
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shop-Platform': shop.platform,
    'X-Shop-Url': shop.shopUrl,
    'X-Shop-Token': shop.token,
  };
  if (shop.secret) h['X-Shop-Secret'] = shop.secret;
  return h;
}

/**
 * Liste les produits de la boutique distante.
 * GET {proxy}/products
 */
export async function listShopProducts(shop: Shop): Promise<RemoteProduct[]> {
  const base = await proxyBase();
  if (!base) throw new ShopApiError('Proxy non configuré. Ajoutez-le dans les Réglages.');
  const resp = await fetch(`${base}/products`, { headers: authHeaders(shop) });
  if (!resp.ok) {
    const msg = await safeErr(resp);
    throw new ShopApiError(msg, resp.status);
  }
  const data = (await resp.json()) as { products?: RemoteProduct[] };
  return data.products ?? [];
}

export interface PushProductInput {
  title: string;
  bodyHtml?: string;
  vendor?: string;
  variants: { price: string; sku?: string; inventoryQuantity?: number }[];
  images?: { src?: string }[];
  tags?: string;
}

/**
 * Crée un produit sur la boutique distante.
 * POST {proxy}/products
 */
export async function pushShopProduct(
  shop: Shop,
  input: PushProductInput,
): Promise<RemoteProduct> {
  const base = await proxyBase();
  if (!base) throw new ShopApiError('Proxy non configuré. Ajoutez-le dans les Réglages.');
  const resp = await fetch(`${base}/products`, {
    method: 'POST',
    headers: authHeaders(shop),
    body: JSON.stringify({ product: input }),
  });
  if (!resp.ok) {
    const msg = await safeErr(resp);
    throw new ShopApiError(msg, resp.status);
  }
  const data = (await resp.json()) as { product: RemoteProduct };
  return data.product;
}

/** Vérifie la connexion à une boutique (GET /health côté proxy + credentials). */
export async function testShopConnection(shop: Shop): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  try {
    const products = await listShopProducts(shop);
    return { ok: true, count: products.length };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

async function safeErr(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    return body?.error ?? body?.message ?? `Erreur HTTP ${resp.status}`;
  } catch {
    return `Erreur HTTP ${resp.status}`;
  }
}
