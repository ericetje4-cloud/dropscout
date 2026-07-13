// ===========================================================================
// Registre des fournisseurs + gestion des préférences (enabledSuppliers).
// Point d'entrée unique : tout le reste de l'app importe depuis ici.
// ===========================================================================

import type { SupplierId } from '@/types';
import type { Supplier, SupplierMeta, SupplierHealthMap } from './types';
import { aliexpressSupplier } from './aliexpress';
import { cjSupplier } from './cj';
import { ebaySupplier } from './ebay';
import { fetchSupplierHealth } from './shared';

/** Tous les fournisseurs supportés, indexés par id. */
export const SUPPLIERS: Record<SupplierId, Supplier> = {
  aliexpress: aliexpressSupplier,
  cj: cjSupplier,
  ebay: ebaySupplier,
};

/** Liste ordonnée pour l'affichage (registry stable). */
export const SUPPLIER_ORDER: SupplierId[] = ['aliexpress', 'cj', 'ebay'];

/** Métadonnées d'affichage de tous les fournisseurs (badge/label/couleur). */
export const SUPPLIER_META: Record<SupplierId, SupplierMeta> = {
  aliexpress: SUPPLIERS.aliexpress.meta,
  cj: SUPPLIERS.cj.meta,
  ebay: SUPPLIERS.ebay.meta,
};

/** Tous les ids (pour défaut enabledSuppliers). */
export const ALL_SUPPLIER_IDS: SupplierId[] = SUPPLIER_ORDER;

/**
 * Récupère les fournisseurs configurés côté proxy (depuis /health).
 * À appeler au démarrage / quand on veut rafraîchir le statut.
 */
export async function getConfiguredSuppliers(): Promise<SupplierId[]> {
  const health = await fetchSupplierHealth();
  return SUPPLIER_ORDER.filter((id) => SUPPLIERS[id].isAvailable(health));
}

/** Récupère la carte de disponibilité complète (pour l'UI Réglages). */
export async function getSuppliersHealth(): Promise<SupplierHealthMap> {
  const raw = await fetchSupplierHealth();
  // S'assure que tous les ids sont présents (même si absents de /health).
  const result: SupplierHealthMap = {};
  for (const id of SUPPLIER_ORDER) {
    result[id] = raw[id] === true;
  }
  return result;
}

export { type Supplier, type SupplierProduct, type SupplierOffer } from './types';
export { aliexpressSupplier, cjSupplier, ebaySupplier };
