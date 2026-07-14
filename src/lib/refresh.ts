// ===========================================================================
// Moteur de rafraîchissement automatique de la veille.
//
// PUR (zéro React) : exécutable indifféremment dans le Service Worker
// (arrière-plan) et dans la fenêtre (catch-up + foreground). Importe
// uniquement db.ts + gemini.ts + research.ts, tous agnostiques du contexte.
//
// Cycle :
//   1. lit la clé Gemini dans IndexedDB → setApiKey (nécessaire côté SW)
//   2. sélectionne les niches « dues » (lastCheckedAt > intervalle)
//   3. relance researchNiche sur chacune → met à jour la Niche
//   4. historise une Analysis pour la traçabilité
// ===========================================================================

import { getAllNiches, getSetting, putNiche } from '@/lib/db';
import { setApiKey } from '@/lib/gemini';
import { researchNiche, type NicheReport } from '@/lib/research';
import { putAnalysis } from '@/lib/db';
import { isQuotaCoolingDown, onQuota429 } from '@/lib/quota-guard';
import { toISODate } from '@/lib/format';
import type { Niche } from '@/types';

/** Intervalle par défaut (h), modifiable dans les réglages. */
export const DEFAULT_INTERVAL_HOURS = 24;

/** Résultat d'un rafraîchissement (pour notification / récap UI). */
export interface RefreshResult {
  refreshed: { nicheId: string; label: string }[];
  failed: { nicheId: string; label: string; error: string }[];
  skipped: { nicheId: string; label: string }[];
}

// ---------------------------------------------------------------------------
// Préparation de la clé API (commune à tous les contextes)
// ---------------------------------------------------------------------------

/**
 * Charge la clé Gemini depuis IndexedDB et l'injecte dans le client runtime.
 * Indispensable côté Service Worker (pas de mémoire partagée avec la fenêtre).
 * @returns true si une clé est disponible.
 */
export async function prepareApiKey(): Promise<boolean> {
  const key = await getSetting('geminiKey');
  if (key && key.length > 0) {
    setApiKey(key);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sélection des niches dues
// ---------------------------------------------------------------------------

/** Intervalle courant en millisecondes (lu depuis les réglages). */
export async function currentIntervalMs(): Promise<number> {
  const hours = (await getSetting('refreshIntervalHours')) ?? DEFAULT_INTERVAL_HOURS;
  return hours * 60 * 60 * 1000;
}

/** true si la niche doit être rafraîchie (jamais checkée OU intervalle écoulé). */
export function isNicheDue(niche: Niche, intervalMs: number, now = Date.now()): boolean {
  if (!niche.lastCheckedAt) return true; // jamais surveillée
  const last = new Date(niche.lastCheckedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= intervalMs;
}

/** Renvoie les niches à rafraîchir selon l'intervalle courant. */
export async function getDueNiches(): Promise<Niche[]> {
  const [all, intervalMs] = await Promise.all([getAllNiches(), currentIntervalMs()]);
  return all.filter((n) => isNicheDue(n, intervalMs));
}

// ---------------------------------------------------------------------------
// Rafraîchissement d'une niche
// ---------------------------------------------------------------------------

/**
 * Relance la veille d'une niche et persiste le résultat.
 * @returns la niche mise à jour, ou null en cas d'échec.
 */
export async function refreshNiche(
  niche: Niche,
): Promise<{ niche: Niche; report: NicheReport }> {
  const report = await researchNiche(niche.label, niche.region || 'FR');

  // Sérialise le rapport structuré pour le stockage (rétro-compatible : si
  // l'UI lit un ancien format texte, parseStoredReport le gère).
  const serialized = JSON.stringify(report);

  const updated: Niche = {
    ...niche,
    lastReport: serialized,
    lastSources: report.sources,
    lastCheckedAt: toISODate(new Date()),
    updatedAt: Date.now(),
  };
  await putNiche(updated);

  // Historisation pour traçabilité / comparaison dans le temps.
  await putAnalysis({
    id: crypto.randomUUID(),
    input: `Veille niche : ${niche.label} (${niche.region || 'FR'})`,
    report: report.summary,
    createdAt: Date.now(),
  });

  return { niche: updated, report };
}

// ---------------------------------------------------------------------------
// Orchestrateur principal
// ---------------------------------------------------------------------------

/**
 * Rafraîchit toutes les niches dues.
 * @param options.force  si true, ignore l'intervalle (rafraîchit toutes les niches)
 * @returns récap des niches rafraîchies / échouées / ignorées
 */
export async function refreshDueNiches(
  options: { force?: boolean } = {},
): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: [], failed: [], skipped: [] };

  // Garde-fou quota : si on vient de prendre un 429, on s'abstient pendant 5 min
  // pour ne pas gaspiller le quota restant. (Ignore en cas de force manuel.)
  if (!options.force && isQuotaCoolingDown()) {
    const all = await getAllNiches();
    result.skipped.push(...all.map((n) => ({ nicheId: n.id, label: n.label })));
    return result;
  }

  const hasKey = await prepareApiKey();
  if (!hasKey) {
    // Sans clé, on ne peut rien faire. Pas d'erreur levée : l'app reste utilisable.
    const all = await getAllNiches();
    result.skipped.push(
      ...all.map((n) => ({ nicheId: n.id, label: n.label })),
    );
    return result;
  }

  const all = await getAllNiches();
  if (all.length === 0) return result;

  const intervalMs = options.force ? 0 : await currentIntervalMs();
  const due = all.filter((n) => options.force || isNicheDue(n, intervalMs));

  for (const niche of due) {
    try {
      await refreshNiche(niche);
      result.refreshed.push({ nicheId: niche.id, label: niche.label });
    } catch (e) {
      // 429 : enregistre la pénalité, marque cette niche ET les restantes comme
      // échouées, puis sort (inutile de continuer : quota saturé pour toutes).
      onQuota429(e);
      const msg = (e as Error).message;
      const remaining = due.slice(due.indexOf(niche));
      result.failed.push(
        ...remaining.map((n) => ({ nicheId: n.id, label: n.label, error: msg })),
      );
      break;
    }
  }

  // Les niches non dues sont juste ignorées (pour information).
  for (const n of all) {
    if (!due.includes(n)) {
      result.skipped.push({ nicheId: n.id, label: n.label });
    }
  }

  return result;
}
