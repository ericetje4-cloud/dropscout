// ===========================================================================
// Types partagés de l'abstraction multi-fournisseurs.
//
// Un "Supplier" est un adaptateur qui sait :
//   - rechercher des produits par mots-clés (via le proxy)
//   - indiquer s'il est configuré (via /health)
//   - construire l'URL d'image proxyée (contournement hotlink)
// ===========================================================================

import type { SupplierId } from '@/types';

/** Un produit renvoyé par un fournisseur (forme neutre, supplier-agnostique). */
export interface SupplierProduct {
  supplier: SupplierId;
  title: string;
  imageUrl: string;
  /** Prix sous forme de chaîne parsable (ex: "8.50"). */
  price: string;
  /** Code devise ISO (ex: "EUR"). */
  currency: string;
  productUrl: string;
  productId: string;
}

/**
 * Une offre rattachée à un produit IA de la veille : un fournisseur + son
 * meilleur match. Plusieurs offres par produit (une par source disponible).
 */
export interface SupplierOffer {
  supplier: SupplierId;
  image: string;
  /** Prix formaté lisible (ex: "8,50 €" ou "8.50 EUR"). */
  price: string;
  currency: string;
  productUrl: string;
  /** Valeur numérique pour le tri par prix croissant. */
  priceValue: number;
}

/** Métadonnées d'affichage d'un fournisseur (badge, label). */
export interface SupplierMeta {
  id: SupplierId;
  /** Libellé affiché : "AliExpress", "CJ Dropshipping", "eBay". */
  label: string;
  /** Emoji/couleur pour le badge. */
  badge: string;
  /** Couleur Tailwind (text) pour le badge. */
  color: string;
}

/** Interface qu'implémente chaque adapter fournisseur. */
export interface Supplier {
  meta: SupplierMeta;
  /** Recherche des produits par mots-clés (via le proxy). */
  search(keywords: string): Promise<SupplierProduct[]>;
  /** true si ce fournisseur est configuré côté proxy (via /health). */
  isAvailable(health: SupplierHealthMap): boolean;
  /** URL d'image proxyée pour le fallback hotlink. */
  imageProxyUrl(cdnUrl: string): string;
}

/** Carte de disponibilité des fournisseurs renvoyée par /health. */
export type SupplierHealthMap = Partial<Record<SupplierId, boolean>>;

/** Erreur typée d'un fournisseur. */
export class SupplierError extends Error {
  supplier: SupplierId;
  constructor(supplier: SupplierId, message: string) {
    super(message);
    this.name = 'SupplierError';
    this.supplier = supplier;
  }
}
