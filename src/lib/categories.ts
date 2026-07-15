// ===========================================================================
// Catégories génériques surveillées en continu.
//
// Ces catégories sont "semées" comme des niches système (origin: 'category')
// au premier lancement. L'auto-refresh existant les prend en charge sans
// modification : chaque cycle, Gemini vérifie si une tendance NOUVELLE émerge
// (researchCategoryNiche), et si oui → notification 🔥 + badge visuel.
// ===========================================================================

import { getAllNiches, putNiche } from '@/lib/db';
import type { Niche } from '@/types';

/** Définition d'une catégorie surveillée. */
export interface CategoryDef {
  key: string;
  label: string;
  region: string;
}

/**
 * Catégories fixes surveillées (choisies par l'utilisateur).
 * Coût quota : 1 appel Gemini par catégorie à chaque cycle de refresh.
 */
export const CATEGORIES: CategoryDef[] = [
  { key: 'fitness', label: 'Fitness & bien-être', region: 'FR' },
  { key: 'home', label: 'Maison & déco', region: 'FR' },
];

/**
 * Sème les niches de catégorie dans le store (idempotente).
 * Ne crée que les catégories qui n'existent pas déjà (dedup par categoryKey).
 * À appeler au démarrage après l'onboarding — sans risque si appelée plusieurs fois.
 */
export async function seedCategoryNiches(): Promise<void> {
  const existing = await getAllNiches();
  const existingKeys = new Set(
    existing.filter((n) => n.categoryKey).map((n) => n.categoryKey),
  );

  for (const cat of CATEGORIES) {
    if (existingKeys.has(cat.key)) continue;
    const now = Date.now();
    const niche: Niche = {
      id: crypto.randomUUID(),
      label: cat.label,
      region: cat.region,
      origin: 'category',
      categoryKey: cat.key,
      // lastCheckedAt absent → sera rafraîchie au premier cycle.
      createdAt: now,
      updatedAt: now,
    };
    await putNiche(niche);
  }
}

/**
 * Récupère la niche système d'une catégorie (par sa clé).
 */
export async function getCategoryNiche(key: string): Promise<Niche | undefined> {
  const all = await getAllNiches();
  return all.find((n) => n.categoryKey === key);
}

/** true si une niche est une catégorie surveillée (vs niche utilisateur). */
export function isCategoryNiche(niche: Niche): boolean {
  return niche.origin === 'category' && !!niche.categoryKey;
}
