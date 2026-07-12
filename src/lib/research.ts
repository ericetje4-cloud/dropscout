// ===========================================================================
// Recherche & analyse produit (IA Gemini).
//
// Deux modes distincts :
//   1. researchNiche() : grounding Google Search → tendances réelles du web,
//      renvoie un rapport + les sources (URLs de citation). Appel SÉPARÉ de
//      l'agent principal (google_search est incompatible avec function calling).
//   2. analyzeProduct() : analyse un produit (URL/description + prix) et
//      renvoie un score structuré + rapport en mode JSON.
// ===========================================================================

import { generateContent, hasApiKey, type GroundingMetadata } from '@/lib/gemini';
import type { ProductScore } from '@/types';

// ---------------------------------------------------------------------------
// Veille de niche (Google Search grounding)
// ---------------------------------------------------------------------------

export interface NicheReport {
  /** Rapport synthétique en markdown (tendances, produits montants). */
  report: string;
  /** Sources web (URLs) citées par le grounding. */
  sources: string[];
}

/**
 * Lance une veille sur une niche via Google Search grounding.
 * Renvoie un rapport textuel + les URLs de sources réelles.
 */
export async function researchNiche(
  niche: string,
  region = 'FR',
): Promise<NicheReport> {
  if (!hasApiKey()) {
    throw new Error('Aucune clé API Gemini configurée. Ajoutez-la dans les Réglages.');
  }

  const prompt = `Tu es un expert en dropshipping et e-commerce. Analyse la niche « ${niche} » pour le marché ${region}.

Identifie :
1. Les produits actuellement montants / viraux dans cette niche ( TikTok, Instagram, AliExpress, Amazon best-sellers).
2. Les sous-tendances émergentes des 3 derniers mois.
3. Les saisons ou événements à venir qui peuvent booster cette niche.
4. 5 à 8 idées de produits concrets avec : nom, prix de vente estimé, public cible, angle marketing.

Sois concret, factual et cite les types de sources. Réponds en français, au format markdown structuré.`;

  const resp = await generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    googleSearch: true,
    temperature: 0.7,
  });

  const cand = resp.candidates?.[0];
  const text =
    cand?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') ??
    'Aucun rapport généré.';

  const sources = extractSources(cand?.groundingMetadata);

  return { report: text.trim(), sources };
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
