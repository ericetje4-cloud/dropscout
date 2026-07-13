// ===========================================================================
// Agrégateur multi-fournisseurs.
//
// Pour un produit donné, interroge TOUS les fournisseurs activés en parallèle,
// garde le meilleur match de chacun, et trie les offres par prix croissant.
// ===========================================================================

import type { SupplierId } from '@/types';
import { SUPPLIERS } from './registry';
import { bestMatch, parsePrice } from './shared';
import type { SupplierProduct, SupplierOffer } from './types';

/**
 * Recherche un mot-clé chez plusieurs fournisseurs en parallèle.
 * @returns une map { supplierId -> SupplierProduct[] }. Les échecs → [].
 */
export async function searchAcrossSuppliers(
  keywords: string,
  supplierIds: SupplierId[],
): Promise<Record<string, SupplierProduct[]>> {
  const results = await Promise.allSettled(
    supplierIds.map(async (id) => {
      const products = await SUPPLIERS[id].search(keywords);
      return [id, products] as const;
    }),
  );

  const out: Record<string, SupplierProduct[]> = {};
  for (const id of supplierIds) out[id] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      out[supplierIds[i]] = r.value[1];
    }
    // échec = [] déjà initialisé
  });
  return out;
}

/**
 * Pour un produit IA, récupère la meilleure offre de chaque fournisseur.
 * @returns les offres triées par prix croissant (la moins chère en premier).
 */
export async function findBestOffers(
  iaTitle: string,
  keywords: string,
  supplierIds: SupplierId[],
): Promise<SupplierOffer[]> {
  if (supplierIds.length === 0) return [];

  const bySupplier = await searchAcrossSuppliers(keywords, supplierIds);

  const offers: SupplierOffer[] = [];
  for (const id of supplierIds) {
    const results = bySupplier[id] ?? [];
    if (results.length === 0) continue;
    const match = bestMatch(iaTitle, results);
    if (!match) continue;
    const priceValue = parsePrice(match.price);
    offers.push({
      supplier: id,
      image: match.imageUrl,
      price: match.price,
      currency: match.currency || 'EUR',
      productUrl: match.productUrl,
      priceValue,
    });
  }

  // Tri : offres avec prix valide d'abord, par prix croissant ; sans prix à la fin.
  return offers.sort((a, b) => {
    const aOk = Number.isFinite(a.priceValue);
    const bOk = Number.isFinite(b.priceValue);
    if (aOk && bOk) return a.priceValue - b.priceValue;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  });
}
