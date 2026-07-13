// ===========================================================================
// NicheProductCard : une idée de produit de la veille, avec comparaison
// multi-fournisseurs (meilleure offre mise en avant + sources alternatives).
// ===========================================================================

import { useState } from 'react';
import { ExternalLink, Sparkles, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { NicheProduct } from '@/lib/research';
import { SUPPLIERS } from '@/lib/suppliers/registry';
import type { SupplierOffer } from '@/lib/suppliers/types';
import { addProduct } from '@/hooks/useStore';
import { useToast } from '@/components/ui';

export function NicheProductCard({
  product,
  niche,
  onAnalyze,
}: {
  product: NicheProduct;
  /** Niche de rattachement (pour la watchlist). */
  niche?: string;
  /** Callback "Analyser ce produit". */
  onAnalyze?: (product: NicheProduct) => void;
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllOffers, setShowAllOffers] = useState(false);

  const offers = product.offers ?? [];
  const bestOffer = offers[0]; // déjà trié par prix croissant
  const otherOffers = offers.slice(1);

  // Image de la meilleure offre (ou image legacy si ancien format).
  const primaryImage = bestOffer?.image ?? product.image;

  async function save() {
    setSaving(true);
    try {
      await addProduct({
        title: product.title,
        url: bestOffer?.productUrl ?? product.aliUrl,
        image: primaryImage,
        niche,
        status: 'idea',
        notes: [product.targetAudience, product.marketingAngle, product.estPrice]
          .filter(Boolean)
          .join(' — '),
      });
      setSaved(true);
      toast('Ajouté à la watchlist 💡', 'success');
    } catch {
      toast("Échec de l'ajout.", 'error');
    } finally {
      setSaving(false);
    }
  }

  function analyze() {
    onAnalyze?.(product);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex gap-3 p-3">
        <OfferImage offer={bestOffer} fallbackUrl={product.image} />

        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">{product.title}</p>

          {/* Offres par fournisseur */}
          {offers.length > 0 ? (
            <div className="mt-1.5 space-y-1">
              <OfferRow offer={bestOffer} highlight />
              {showAllOffers &&
                otherOffers.map((o, i) => <OfferRow key={i} offer={o} />)}
              {otherOffers.length > 0 && (
                <button
                  onClick={() => setShowAllOffers((s) => !s)}
                  className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {showAllOffers ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {showAllOffers
                    ? 'Réduire'
                    : `${otherOffers.length} autre(s) source(s)`}
                </button>
              )}
            </div>
          ) : product.aliPrice ? (
            // Rétro-compat ancien format (déjà migré en offers, mais au cas où)
            <p className="mt-1 text-xs text-slate-500">AliExpress · {product.aliPrice}</p>
          ) : product.estPrice ? (
            <p className="mt-1 text-xs text-slate-500">Est. {product.estPrice}</p>
          ) : null}

          {/* Détails IA */}
          {(product.targetAudience || product.marketingAngle) && (
            <div className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              {product.targetAudience && <p>🎯 {product.targetAudience}</p>}
              {product.marketingAngle && <p>📣 {product.marketingAngle}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        {onAnalyze && (
          <button onClick={analyze} className="btn-ghost flex-1 py-1.5 text-xs">
            <Sparkles size={13} /> Analyser
          </button>
        )}
        <button
          onClick={() => void save()}
          disabled={saved || saving}
          className="btn-secondary flex-1 py-1.5 text-xs"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            '✅ Watchlist'
          ) : (
            <>
              <Save size={13} /> Ajouter
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image d'une offre (essaie directe, fallback proxy si hotlink)
// ---------------------------------------------------------------------------

function OfferImage({
  offer,
  fallbackUrl,
}: {
  offer?: SupplierOffer;
  fallbackUrl?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const url = offer?.image ?? fallbackUrl;
  const supplierId = offer?.supplier ?? 'aliexpress';

  if (!url) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-3xl dark:bg-slate-800">
        📦
      </div>
    );
  }

  // Essai direct (no-referrer), fallback proxy propre au fournisseur si hotlink.
  const proxyFallback = SUPPLIERS[supplierId]?.imageProxyUrl(url) ?? url;

  if (!imgError) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200 dark:ring-slate-700"
      />
    );
  }
  return (
    <img
      src={proxyFallback}
      alt=""
      className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200 dark:ring-slate-700"
    />
  );
}

// ---------------------------------------------------------------------------
// Une ligne offre (badge fournisseur + prix + lien)
// ---------------------------------------------------------------------------

function OfferRow({ offer, highlight = false }: { offer: SupplierOffer; highlight?: boolean }) {
  const meta = SUPPLIERS[offer.supplier]?.meta;
  const priceLabel = formatOfferPrice(offer);

  return (
    <div
      className={`flex items-center gap-2 text-xs ${
        highlight ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'
      }`}
    >
      <span title={meta?.label}>{meta?.badge ?? '•'}</span>
      <span className={highlight ? meta?.color ?? '' : ''}>{meta?.label}</span>
      {priceLabel && <span>· {priceLabel}</span>}
      {offer.productUrl && (
        <a
          href={offer.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-0.5 text-brand-600 hover:underline dark:text-brand-400"
        >
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

/** Formate le prix d'une offre de façon lisible. */
function formatOfferPrice(offer: SupplierOffer): string {
  if (!offer.price) return '';
  // Si le prix est déjà formaté avec devise, on garde tel quel.
  if (/\d/.test(offer.price)) {
    return Number.isFinite(offer.priceValue)
      ? `${offer.price} ${offer.currency}`
      : offer.price;
  }
  return offer.price;
}
