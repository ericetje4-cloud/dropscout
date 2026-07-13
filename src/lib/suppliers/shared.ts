// ===========================================================================
// Helpers partagés par tous les adapters fournisseurs.
// Extraits de l'ancien aliexpress-api.ts (déjà supplier-agnostiques).
// ===========================================================================

import { getSetting } from '@/lib/db';

/**
 * Récupère l'URL du proxy depuis les settings (sans slash final).
 * Async — pour usage dans les fonctions réseau.
 */
export async function proxyBase(): Promise<string> {
  const url = (await getSetting('proxyUrl')) ?? '';
  return url.replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Cache synchrone de l'URL proxy
// (nécessaire pour les fallback <img> qui ne peuvent pas être async).
// ---------------------------------------------------------------------------

let _proxyBaseCache = '';

/** Pré-charge l'URL du proxy en cache synchrone (à l'init de l'app). */
export function primeProxyBaseCache(url: string): void {
  _proxyBaseCache = url.replace(/\/$/, '');
}

/** Lit l'URL du proxy depuis le cache synchrone. */
export function cachedProxyBase(): string {
  return _proxyBaseCache;
}

// ---------------------------------------------------------------------------
// Appariement (bestMatch) — supplier-agnostique
// ---------------------------------------------------------------------------

/**
 * Apparie un titre de produit IA au meilleur résultat fournisseur.
 * Score basé sur le nombre de mots-clés communs (normalisé).
 */
export function bestMatch<T extends { title: string }>(
  iaTitle: string,
  results: T[],
): T | null {
  if (results.length === 0) return null;
  const iaTokens = tokenize(iaTitle);
  if (iaTokens.length === 0) return results[0] ?? null;

  let best: T | null = null;
  let bestScore = -1;
  for (const r of results) {
    const tokens = tokenize(r.title);
    const common = iaTokens.filter((t) => tokens.includes(t)).length;
    const score = common / Math.max(iaTokens.length, tokens.length);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Tokenisation normalisée (lowercase, sans accents, >= 3 chars). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/**
 * Construit l'URL d'image proxyée pour un fournisseur donné.
 * Utilise le cache synchrone (primeProxyBaseCache doit avoir été appelé).
 */
export function buildImageProxyUrl(supplierId: string, cdnUrl: string): string {
  const base = cachedProxyBase();
  if (!base || !cdnUrl) return cdnUrl;
  return `${base}/supplier/${supplierId}/img?url=${encodeURIComponent(cdnUrl)}`;
}

// ---------------------------------------------------------------------------
// Parsing de prix — normalise des formats variés en nombre triable
// ---------------------------------------------------------------------------

/**
 * Parse un prix en nombre (pour le tri). Tolère "8.50", "8,50", "8.50 EUR".
 * Retourne NaN si non parsable.
 */
export function parsePrice(raw: string | number | undefined): number {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw)
    .replace(/[^0-9.,]/g, '')
    // Si une virgule et un point coexistent, la virgule = séparateur de milliers.
    .replace(/,(\d{3})\b/g, '$1')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Parse robustement le corps d'erreur d'une Response. */
export async function safeErr(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    return body?.error ?? body?.message ?? `Erreur HTTP ${resp.status}`;
  } catch {
    return `Erreur HTTP ${resp.status}`;
  }
}

/**
 * Récupère la carte de disponibilité des fournisseurs depuis /health.
 * Retourne {} si proxy non configuré ou injoignable.
 */
export async function fetchSupplierHealth(): Promise<
  Partial<Record<string, boolean>>
> {
  const base = await proxyBase();
  if (!base) return {};
  try {
    const resp = await fetch(`${base}/health`);
    if (!resp.ok) return {};
    const data = (await resp.json()) as {
      suppliers?: Record<string, boolean>;
      aliexpress?: boolean; // legacy
    };
    return data.suppliers ?? (data.aliexpress != null ? { aliexpress: data.aliexpress } : {});
  } catch {
    return {};
  }
}
