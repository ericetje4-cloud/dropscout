// ===========================================================================
// Garde-fou quota Gemini : mémorise le dernier 429 et empêche les appels
// automatiques (veille, catch-up) pendant une période de "pénalité" pour ne
// pas gaspiller le peu de quota restant.
//
// Pur mémoire (module-level, pas persisté) : se reset au reload de l'app.
// ===========================================================================

import type { GeminiError } from '@/lib/gemini';

/** Durée de pénalité après un 429 : 5 min (on laisse le quota minute se vider). */
const PENALTY_MS = 5 * 60 * 1000;

let last429 = 0;

/** À appeler quand un appel Gemini reçoit un 429. */
export function reportQuotaHit(): void {
  last429 = Date.now();
}

/**
 * true si on est en période de pénalité (un 429 récent).
 * Les appels automatiques (veille) doivent s'abstenir dans ce cas.
 */
export function isQuotaCoolingDown(): boolean {
  return Date.now() - last429 < PENALTY_MS;
}

/**
 * Enregistre le 429 si l'erreur passée en est une, puis la rejette telle quelle.
 * Pratique à chaîner dans un catch.
 *
 * @example
 * try { await researchNiche(...) }
 * catch (e) { throw onQuota429(e); }
 */
export function onQuota429(e: unknown): unknown {
  if (is429(e)) reportQuotaHit();
  return e;
}

/** Détecte si une erreur est un 429 (status ou message). */
export function is429(e: unknown): boolean {
  if (!e) return false;
  const err = e as Partial<GeminiError> & { status?: number };
  return err.status === 429 || String(err.message ?? '').includes('429');
}
