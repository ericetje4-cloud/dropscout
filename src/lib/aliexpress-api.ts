// ===========================================================================
// SHIM de rétro-compatibilité.
// AliExpress est désormais un adapter du module suppliers/. Ce fichier garde
// les anciens exports pour ne pas casser les imports existants ; il sera
// progressivement retiré au profit de src/lib/suppliers/*.
// ===========================================================================

// @deprecated — importer depuis '@/lib/suppliers/*' pour tout nouveau code.

import { aliexpressSupplier } from '@/lib/suppliers/aliexpress';
import {
  bestMatch,
  buildImageProxyUrl,
  fetchSupplierHealth,
  primeProxyBaseCache,
} from '@/lib/suppliers/shared';
import type { SupplierProduct } from '@/lib/suppliers/types';

/** @deprecated alias de SupplierProduct (anciennement AliProduct). */
export type AliProduct = SupplierProduct;

/** @deprecated utiliser getConfiguredSuppliers() depuis suppliers/registry. */
export async function isAliExpressAvailable(): Promise<boolean> {
  const health = await fetchSupplierHealth();
  return health.aliexpress === true;
}

/** @deprecated utiliser aliexpressSupplier.search(). */
export async function searchAliExpressProducts(keywords: string): Promise<SupplierProduct[]> {
  return aliexpressSupplier.search(keywords);
}

/** @deprecated utiliser aliexpressSupplier.imageProxyUrl(). */
export function aliexpressImageFallback(cdnUrl: string): string {
  return buildImageProxyUrl('aliexpress', cdnUrl);
}

/** @deprecated réexporté depuis suppliers/shared. */
export { bestMatch, primeProxyBaseCache };
