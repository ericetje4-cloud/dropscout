// ===========================================================================
// Recherche & analyse produit (IA Gemini).
//
// Deux modes distincts :
//   1. researchNiche() : grounding Google Search → tendances réelles du web,
//      renvoie un rapport STRUCTURÉ (JSON) + les sources (URLs de citation).
//      Appel SÉPARÉ de l'agent principal (google_search est incompatible avec
//      function calling). enrichNicheReport() y attache ensuite les vraies
//      photos/prix AliExpress via le proxy.
//   2. analyzeProduct() : analyse un produit (URL/description + prix) et
//      renvoie un score structuré + rapport en mode JSON.
// ===========================================================================

import { generateContent, hasApiKey, type GroundingMetadata } from '@/lib/gemini';
import { getSetting } from '@/lib/db';
import { findBestOffers } from '@/lib/suppliers/aggregate';
import type { SupplierOffer } from '@/lib/suppliers/types';
import type { SupplierId } from '@/types';
import type { ProductScore } from '@/types';

// ---------------------------------------------------------------------------
// Veille de niche (Google Search grounding) — sortie JSON structurée
// ---------------------------------------------------------------------------

/** Une idée de produit issue de la veille IA. */
export interface NicheProduct {
  title: string;
  /** Mots-clés de recherche (en anglais de préférence, pour les fournisseurs). */
  keywords: string;
  targetAudience: string;
  marketingAngle: string;
  /** Prix de vente estimé par l'IA (texte libre). */
  estPrice?: string;
  // --- Champs remplis par enrichNicheReport (multi-fournisseurs) ---
  /**
   * Offres trouvées chez les fournisseurs activés, triées par prix croissant.
   * La première est la meilleure offre (la moins chère).
   */
  offers?: SupplierOffer[];
  /**
   * @deprecated ancien format (AliExpress seul). Conservé pour la compat
   * descendante des rapports stockés avant la migration multi-fournisseurs.
   */
  image?: string;
  aliPrice?: string;
  aliUrl?: string;
}

/** Rapport de veille structuré. */
export interface NicheReport {
  /** Synthèse des tendances (texte). */
  summary: string;
  /** Sous-tendances émergentes. */
  trends: string[];
  /** Événements/saisons à venir pertinents. */
  seasons: string;
  /** Idées de produits (5-8). */
  products: NicheProduct[];
  /** Sources web (URLs) citées par le grounding. */
  sources: string[];
}

/** Récupère les fournisseurs activés pour l'enrichissement (défaut: tous). */
async function getEnabledSuppliersForEnrichment(): Promise<SupplierId[]> {
  const enabled = await getSetting('enabledSuppliers');
  if (Array.isArray(enabled) && enabled.length > 0) return enabled;
  return ['aliexpress', 'cj', 'ebay'];
}

/**
 * Lance une veille sur une niche via Google Search grounding.
 * Renvoie un rapport STRUCTURÉ (JSON) + les URLs de sources réelles.
 *
 * Note : googleSearch et jsonMode sont mutuellement exclusifs chez Gemini.
 * On demande donc un JSON dans le prompt (sans jsonMode) pour garder le
 * grounding actif. Le parsing est tolérant (fallback markdown).
 */
export async function researchNiche(
  niche: string,
  region = 'FR',
): Promise<NicheReport> {
  if (!hasApiKey()) {
    throw new Error('Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.');
  }

  const prompt = `Tu es un expert en dropshipping et e-commerce. Analyse la niche « ${niche} » pour le marché ${region}.

Identifie les tendances réelles (produits viraux TikTok/Instagram, best-sellers AliExpress/Amazon), les sous-tendances émergentes des 3 derniers mois, les saisons/événements à venir, et 5 à 8 idées de produits concrets.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte hors JSON) selon ce schéma :
{
  "summary": "synthèse 3-5 lignes des tendances actuelles de cette niche",
  "trends": ["sous-tendance 1", "sous-tendance 2", "..."],
  "seasons": "événements/saisons à venir qui peuvent booster cette niche",
  "products": [
    {
      "title": "nom du produit en français",
      "keywords": "mots-clés de recherche en ANGLAIS (pour AliExpress, CJ, eBay), ex: 'sunset led lamp'",
      "targetAudience": "public cible",
      "marketingAngle": "angle marketing / accroche",
      "estPrice": "prix de vente estimé, ex: '29,90 €'"
    }
  ]
}`;

  const resp = await generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    googleSearch: true,
    temperature: 0.7,
  });

  const cand = resp.candidates?.[0];
  const text =
    cand?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') ??
    '';
  const sources = extractSources(cand?.groundingMetadata);

  const report = parseNicheReport(text);
  report.sources = sources;
  return report;
}

/**
 * Enrichit un rapport de veille avec les vraies photos/prix/liens AliExpress.
 * Pour chaque produit IA, recherche AliExpress via le proxy et apparie le
 * meilleur résultat. Parallélisé avec timeout — un échec n'empêche pas les autres.
 *
 * @param report le rapport à enrichir (muté)
 * @returns le rapport enrichi (même référence)
 */
export async function enrichNicheReport(report: NicheReport): Promise<NicheReport> {
  const supplierIds = await getEnabledSuppliersForEnrichment();
  if (supplierIds.length === 0) return report;

  const results = await Promise.allSettled(
    report.products.map((p) => withTimeout(enrichProduct(p, supplierIds), 12000)),
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      report.products[i] = r.value;
    }
    // En cas d'échec/timeout, le produit garde sa forme IA (sans offers).
  });
  return report;
}

/**
 * Enrichit un produit : interroge tous les fournisseurs activés en parallèle,
 * garde la meilleure offre de chacun, trie par prix croissant.
 */
async function enrichProduct(
  p: NicheProduct,
  supplierIds: SupplierId[],
): Promise<NicheProduct> {
  const offers = await findBestOffers(p.title, p.keywords, supplierIds);
  if (offers.length === 0) return p;
  return { ...p, offers };
}

/** Timeout sur une promesse (reject après ms). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

/**
 * Parse la réponse JSON de la veille (tolérant : fallback markdown si l'IA
 * n'a pas respecté le format JSON).
 */
function parseNicheReport(raw: string): NicheReport {
  // Tolère ```json ... ``` autour du JSON.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const productsRaw = Array.isArray(obj.products) ? obj.products : [];
    const products: NicheProduct[] = productsRaw
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({
        title: str(p.title) || 'Produit',
        keywords: str(p.keywords) || str(p.title),
        targetAudience: str(p.targetAudience),
        marketingAngle: str(p.marketingAngle),
        estPrice: str(p.estPrice) || undefined,
      }));
    return {
      summary: str(obj.summary) || cleaned,
      trends: arr(obj.trends),
      seasons: str(obj.seasons),
      products: products.slice(0, 10),
      sources: [],
    };
  } catch {
    // Fallback : l'IA n'a pas produit du JSON. On renvoie le texte brut comme
    // synthèse et aucun produit structuré (rétro-compatibilité).
    return {
      summary: raw.trim() || 'Aucun rapport généré.',
      trends: [],
      seasons: '',
      products: [],
      sources: [],
    };
  }
}

/** Extrait les URLs de sources depuis les métadonnées de grounding. */
function extractSources(meta?: GroundingMetadata): string[] {
  if (!meta) return [];
  const fromCitations = (meta.citations ?? [])
    .map((c) => c.uri)
    .filter((u): u is string => !!u);
  if (fromCitations.length > 0) return fromCitations;
  return meta.webSearchQueries ?? [];
}

/** Tente de parser un rapport sérialisé (lastReport). Rétro-compatible. */
export function parseStoredReport(stored: string | undefined): NicheReport | null {
  if (!stored) return null;
  try {
    const obj = JSON.parse(stored) as NicheReport;
    if (typeof obj.summary === 'string' || Array.isArray(obj.products)) {
      // Migration ancien format : aliPrice/aliUrl → offers[].
      if (Array.isArray(obj.products)) {
        obj.products = obj.products.map(migrateLegacyProduct);
      }
      return obj;
    }
  } catch {
    // pas du JSON
  }
  // Ancien format (markdown brut) → rétro-compat.
  return { summary: stored, trends: [], seasons: '', products: [], sources: [] };
}

/**
 * Migre un produit de l'ancien format (AliExpress-only, champs aliPrice/aliUrl)
 * vers le nouveau format multi-offres (offers[]). Sans effet si déjà migré.
 */
function migrateLegacyProduct(p: NicheProduct): NicheProduct {
  if (p.offers && p.offers.length > 0) return p;
  // Ancien format : on reconstruit une offre AliExpress depuis les champs dépréciés.
  if (p.aliPrice || p.aliUrl || p.image) {
    const priceStr = p.aliPrice ?? '';
    return {
      ...p,
      offers: [
        {
          supplier: 'aliexpress',
          image: p.image ?? '',
          price: priceStr,
          currency: 'EUR',
          productUrl: p.aliUrl ?? '',
          priceValue: Number.NaN,
        },
      ],
    };
  }
  return p;
}

// ---------------------------------------------------------------------------
// Analyse de produit (JSON mode)
// ---------------------------------------------------------------------------

export interface ProductAnalysis {
  /** Rapport lisible (forces, faiblesses, angles marketing). */
  report: string;
  /** Score IA 0–100 (demande, concurrence, saisonnalité). */
  scores: {
    demand: number;
    competition: number;
    seasonality: number;
  };
  /** Suggestions d'accroches publicitaires. */
  adHooks: string[];
}

export interface AnalyzeInput {
  /** URL du produit ou description libre. */
  input: string;
  /** Prix d'achat si connu. */
  costPrice?: number;
  /** Prix de revente si connu. */
  sellPrice?: number;
  /** Devise (ex. "EUR"). */
  currency?: string;
}

/**
 * Analyse un produit via l'IA et renvoie un rapport + des scores de demande,
 * concurrence et saisonnalité (en mode JSON pour un parsing fiable).
 */
export async function analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis> {
  if (!hasApiKey()) {
    throw new Error('Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.');
  }

  const ctx = [
    input.costPrice != null ? `Prix d'achat : ${input.costPrice} ${input.currency ?? 'EUR'}` : null,
    input.sellPrice != null ? `Prix de revente estimé : ${input.sellPrice} ${input.currency ?? 'EUR'}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Tu es un analyste produit dropshipping chevronné. Analyse ce produit pour un dropshipper francophone.

Produit :
${input.input}

${ctx ? `\nDonnées prix :\n${ctx}` : ''}

Évalue objectivement :
- La DEMANDE (0-100) : intérêt actuel, potentiel viral.
- La CONCURRENCE (0-100) : 0 = marché saturé, 100 = niche vierge/facile.
- La SAISONNALITÉ (0-100) : pertinence du timing actuel.

Réponds STRICTEMENT en JSON avec ce schéma (pas de texte hors JSON) :
{
  "demand": <number 0-100>,
  "competition": <number 0-100>,
  "seasonality": <number 0-100>,
  "report": "<analyse 5-8 lignes : forces, faiblesses, opportunités, risques>",
  "adHooks": ["<accroche pub 1>", "<accroche pub 2>", "<accroche pub 3>"]
}`;

  const resp = await generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    jsonMode: true,
    temperature: 0.4,
  });

  const text =
    resp.candidates?.[0]?.content?.parts
      ?.map((p) => ('text' in p ? p.text : ''))
      .join('') ?? '';

  return parseAnalysis(text);
}

/** Parse robustement la réponse JSON de l'analyse (tolère le markdown autour). */
function parseAnalysis(raw: string): ProductAnalysis {
  // Tolère ```json ... ``` autour du JSON.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
    };
    const report = typeof obj.report === 'string' ? obj.report : 'Analyse indisponible.';
    const hooks = Array.isArray(obj.adHooks)
      ? obj.adHooks.filter((h): h is string => typeof h === 'string')
      : [];
    return {
      report,
      scores: {
        demand: num(obj.demand),
        competition: num(obj.competition),
        seasonality: num(obj.seasonality),
      },
      adHooks: hooks,
    };
  } catch {
    // Si le JSON échoue, on renvoie quand même le texte brut comme rapport.
    return {
      report: raw || "L'analyse n'a pas pu être interprétée.",
      scores: { demand: 50, competition: 50, seasonality: 50 },
      adHooks: [],
    };
  }
}

/** Convertit les scores IA en ProductScore complet via l'heuristique de scoring. */
export function toProductScore(
  analysis: ProductAnalysis,
  costPrice?: number,
  sellPrice?: number,
): ProductScore {
  // Import local pour casser la dépendance circulaire potentielle.
  // (scoring.ts ne dépend pas de research.ts, donc c'est sûr.)
  return scoreFromAnalysis(analysis, costPrice, sellPrice);
}

// Défini en bas pour garder l'ordre de déclaration propre.
import { scoreProduct } from '@/lib/scoring';
function scoreFromAnalysis(
  analysis: ProductAnalysis,
  costPrice?: number,
  sellPrice?: number,
): ProductScore {
  return scoreProduct({
    costPrice,
    sellPrice,
    demand: analysis.scores.demand,
    competition: analysis.scores.competition,
    seasonality: analysis.scores.seasonality,
  });
}
