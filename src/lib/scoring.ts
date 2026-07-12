// ===========================================================================
// Scoring produit : calcule un score "gagnant" 0–100 + sous-scores.
//
// Le score combine des heuristiques déterministes (marge, prix) avec des
// évaluations IA (demande, concurrence, saisonnalité) transmises par
// analyze_product. Quand l'IA n'est pas disponible, on se rabat sur des
// valeurs neutres.
// ===========================================================================

import type { ProductScore } from '@/types';

export interface ScoreInput {
  /** Prix d'achat (coût fournisseur + shipping). */
  costPrice?: number;
  /** Prix de revente. */
  sellPrice?: number;
  /** Estimation IA de la demande 0–100. */
  demand?: number;
  /** Estimation IA de la concurrence (0 = saturée, 100 = vierge). */
  competition?: number;
  /** Estimation IA de la saisonnalité 0–100 (100 = bon timing). */
  seasonality?: number;
}

/** Calcule la marge brute et le % de marge. */
export function computeMargin(cost?: number, sell?: number): { margin: number; marginPct: number } | null {
  if (cost == null || sell == null || !Number.isFinite(cost) || !Number.isFinite(sell)) {
    return null;
  }
  if (cost <= 0 || sell <= 0) return null;
  const margin = sell - cost;
  const marginPct = margin / sell;
  return { margin, marginPct };
}

/**
 * Score de marge : on récompense les marges ≥ 60 % (score 100) et on pénalise
 * sévèrement les marges < 20 %. Modèle : sigmoïde centrée sur 40 % de marge.
 */
function marginScore(marginPct: number | undefined): number {
  if (marginPct == null || !Number.isFinite(marginPct)) return 50; // neutre
  // sigmoïde : 60% → ~93, 40% → 50, 20% → ~7
  const x = (marginPct - 0.4) * 12;
  return clamp(Math.round((1 / (1 + Math.exp(-x))) * 100));
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Score de prix de vente : la "zone idéale" du dropshipping se situe entre
 * 20 € et 60 € (assez pour absorber les frais pub, pas trop pour de l'achat
 * d'impulsion). Hors de cette zone, le score baisse.
 */
function priceScore(sellPrice: number | undefined): number {
  if (sellPrice == null || !Number.isFinite(sellPrice)) return 50;
  if (sellPrice < 15) return clamp(40 + (sellPrice - 15) * 3);
  if (sellPrice <= 60) return 100;
  // Au-delà de 60 €, décroissance progressive.
  return clamp(100 - (sellPrice - 60) * 1.2);
}

/**
 * Calcule le score gagnant complet d'un produit.
 * Pondérations : marge 35 %, demande 25 %, concurrence 20 %, saisonnalité 10 %,
 * prix 10 %.
 */
export function scoreProduct(input: ScoreInput): ProductScore {
  const m = computeMargin(input.costPrice, input.sellPrice);

  const margin = marginScore(m?.marginPct);
  const demand = clamp(input.demand ?? 50);
  const competition = clamp(input.competition ?? 50);
  const seasonality = clamp(input.seasonality ?? 50);
  const price = priceScore(input.sellPrice);

  const total = Math.round(
    margin * 0.35 +
      demand * 0.25 +
      competition * 0.2 +
      seasonality * 0.1 +
      price * 0.1,
  );

  return {
    total: clamp(total),
    margin,
    demand,
    competition,
    seasonality,
  };
}
