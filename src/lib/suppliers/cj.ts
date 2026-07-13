// ===========================================================================
// Adapter CJ Dropshipping.
// API : Product List V2 (api.cjdropshipping.com), auth Bearer token.
// Le token (CJ_TOKEN) est gardé côté proxy — jamais dans le navigateur.
// ===========================================================================

import type { Supplier, SupplierProduct } from './types';
import { proxyBase, safeErr, buildImageProxyUrl } from './shared';
import type { SupplierHealthMap } from './types';

export const cjSupplier: Supplier = {
  meta: {
    id: 'cj',
    label: 'CJ Dropshipping',
    badge: '🔵',
    color: 'text-blue-600 dark:text-blue-400',
  },

  async search(keywords: string): Promise<SupplierProduct[]> {
    const base = await proxyBase();
    if (!base) throw new Error('Proxy non configuré. Ajoutez-le dans les Réglages.');

    const resp = await fetch(
      `${base}/supplier/cj/search?keywords=${encodeURIComponent(keywords)}`,
    );
    if (!resp.ok) throw new Error(await safeErr(resp));
    const data = (await resp.json()) as { products?: Omit<SupplierProduct, 'supplier'>[] };
    return (data.products ?? []).map((p) => ({ ...p, supplier: 'cj' as const }));
  },

  isAvailable(health: SupplierHealthMap): boolean {
    return health.cj === true;
  },

  imageProxyUrl(cdnUrl: string): string {
    return buildImageProxyUrl('cj', cdnUrl);
  },
};
