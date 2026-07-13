// ===========================================================================
// Client AliExpress : parle au proxy Cloudflare Worker (routes /aliexpress/*).
//
// L'API AliExpress Affiliate exige une signature MD5 serveur + n'envoie pas de
// CORS → tout passe par le proxy. Les credentials (app_key/app_secret) restent
// côté Worker, jamais dans le bundle navigateur.
// ===========================================================================

import { getSetting } from '@/lib/db';

/** Un produit AliExpress tel que renvoyé par le proxy. */
export interface AliProduct {
  title: string;
  imageUrl: string;
  price: string;
  currency: string;
  productUrl: string;
  productId: string;
}

/** Récupère l'URL du proxy depuis les settings (sans slash final). */
async function proxyBase(): Promise<string> {
  const url = (await getSetting('proxyUrl')) ?? '';
  return url.replace(/\/$/, '');
}

export class AliExpressError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AliExpressError';
    this.status = status;
  }
}

/**
 * Vérifie si AliExpress est configuré côté proxy (via /health).
 * @returns true si les credentials AliExpress sont en place sur le Worker.
 */
export async function isAliExpressAvailable(): Promise<boolean> {
  const base = await proxyBase();
  if (!base) return false;
  try {
    const resp = await fetch(`${base}/health`);
    if (!resp.ok) return false;
    const data = (await resp.json()) as { aliexpress?: boolean };
    return data.aliexpress === true;
  } catch {
    return false;
  }
}

/**
 * Recherche des produits AliExpress par mots-clés.
 * @param keywords mots-clés de recherche (ex: "lampe LED coucher de soleil")
 * @returns liste de produits avec image, prix, lien
 */
export async function searchAliExpressProducts(keywords: string): Promise<AliProduct[]> {
  const base = await proxyBase();
  if (!base) throw new AliExpressError('Proxy non configuré. Ajoutez-le dans les Réglages.');

  const resp = await fetch(
    `${base}/aliexpress/search?keywords=${encodeURIComponent(keywords)}`,
  );
  if (!resp.ok) {
    const msg = await safeErr(resp);
    throw new AliExpressError(msg, resp.status);
  }
  const data = (await resp.json()) as { products?: AliProduct[] };
  return data.products ?? [];
}

/**
 * Renvoie l'URL à utiliser dans un <img> pour une image AliExpress.
 * On essaie d'abord l'URL directe avec referrerpolicy="no-referrer" côté DOM ;
 * ce helper fournit l'URL proxyée de fallback (pour contourner le hotlink).
 */
export function aliexpressImageFallback(cdnUrl: string): string {
  // L'URL proxyée est construite à la volée au moment de l'affichage ; le
  // proxyBase est lu de façon synchrone depuis un cache (voir plus bas).
  const base = cachedProxyBase();
  if (!base || !cdnUrl) return cdnUrl;
  return `${base}/aliexpress/img?url=${encodeURIComponent(cdnUrl)}`;
}

// Cache synchrone de l'URL proxy (préchargé au démarrage de l'app).
let _proxyBaseCache = '';
export function primeProxyBaseCache(url: string): void {
  _proxyBaseCache = url.replace(/\/$/, '');
}
function cachedProxyBase(): string {
  return _proxyBaseCache;
}

/**
 * Apparie un titre de produit IA au meilleur résultat AliExpress.
 * Score basé sur le nombre de mots-clés communs (normalisé).
 */
export function bestMatch(iaTitle: string, results: AliProduct[]): AliProduct | null {
  if (results.length === 0) return null;
  const iaTokens = tokenize(iaTitle);
  if (iaTokens.length === 0) return results[0] ?? null;

  let best: AliProduct | null = null;
  let bestScore = -1;
  for (const r of results) {
    const tokens = tokenize(r.title);
    const common = iaTokens.filter((t) => tokens.includes(t)).length;
    // Score = mots communs / max(longueurs) pour pénaliser les titres trop courts.
    const score = common / Math.max(iaTokens.length, tokens.length);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Tokenisation normalisée pour la similarité (lowercase, sans accents, >= 3 chars). */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

async function safeErr(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    return body?.error ?? body?.message ?? `Erreur HTTP ${resp.status}`;
  } catch {
    return `Erreur HTTP ${resp.status}`;
  }
}
