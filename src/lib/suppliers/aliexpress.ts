// ===========================================================================
// Adapter AliExpress (refactor depuis l'ancien aliexpress-api.ts).
// Communique avec le proxy via /supplier/aliexpress/* (et l'ancien chemin
// /aliexpress/* en alias rétro-compatible).
// ===========================================================================

import type { Supplier, SupplierProduct } from './types';
import { proxyBase, safeErr, buildImageProxyUrl } from './shared';
import type { SupplierHealthMap } from './types';

export const aliexpressSupplier: Supplier = {
  meta: {
    id: 'aliexpress',
    label: 'AliExpress',
    badge: '🟢',
    color: 'text-green-600 dark:text-green-400',
  },

  async search(keywords: string): Promise<SupplierProduct[]> {
    const base = await proxyBase();
    if (!base) throw new Error('Proxy non configuré. Ajoutez-le dans les Réglages.');

    const resp = await fetch(
      `${base}/supplier/aliexpress/search?keywords=${encodeURIComponent(keywords)}`,
    );
    if (!resp.ok) throw new Error(await safeErr(resp));
    const data = (await resp.json()) as { products?: Omit<SupplierProduct, 'supplier'>[] };
    return (data.products ?? []).map((p) => ({ ...p, supplier: 'aliexpress' as const }));
  },

  isAvailable(health: SupplierHealthMap): boolean {
    return health.aliexpress === true;
  },

  imageProxyUrl(cdnUrl: string): string {
    return buildImageProxyUrl('aliexpress', cdnUrl);
  },
};
