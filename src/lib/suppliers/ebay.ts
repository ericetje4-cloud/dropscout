// ===========================================================================
// Adapter eBay (Browse API).
// API : item_summary/search, OAuth2 Client Credentials (token caché côté proxy).
// eBay sert surtout de SIGNAL de demande/prix marché, pas de source d'appro.
// ===========================================================================

import type { Supplier, SupplierProduct } from './types';
import { proxyBase, safeErr, buildImageProxyUrl } from './shared';
import type { SupplierHealthMap } from './types';

export const ebaySupplier: Supplier = {
  meta: {
    id: 'ebay',
    label: 'eBay',
    badge: '🟡',
    color: 'text-amber-600 dark:text-amber-400',
  },

  async search(keywords: string): Promise<SupplierProduct[]> {
    const base = await proxyBase();
    if (!base) throw new Error('Proxy non configuré. Ajoutez-le dans les Réglages.');

    const resp = await fetch(
      `${base}/supplier/ebay/search?keywords=${encodeURIComponent(keywords)}`,
    );
    if (!resp.ok) throw new Error(await safeErr(resp));
    const data = (await resp.json()) as { products?: Omit<SupplierProduct, 'supplier'>[] };
    return (data.products ?? []).map((p) => ({ ...p, supplier: 'ebay' as const }));
  },

  isAvailable(health: SupplierHealthMap): boolean {
    return health.ebay === true;
  },

  imageProxyUrl(cdnUrl: string): string {
    return buildImageProxyUrl('ebay', cdnUrl);
  },
};
