// ===========================================================================
// NicheProductCard : une idée de produit de la veille, avec VRAIE photo
// AliExpress + prix + lien d'achat (si enrichi), et actions.
// ===========================================================================

import { useState } from 'react';
import { ExternalLink, Sparkles, Save, Loader2 } from 'lucide-react';
import type { NicheProduct } from '@/lib/research';
import { aliexpressImageFallback } from '@/lib/aliexpress-api';
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
  /** Callback "Analyser ce produit" (pousse vers le flux d'analyse IA). */
  onAnalyze?: (product: NicheProduct) => void;
}) {
  const { toast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await addProduct({
        title: product.title,
        url: product.aliUrl,
        image: product.image,
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

  return (
    <div className="card overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Image : essaie directe (no-referrer), fallback proxy si hotlink */}
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200 dark:ring-slate-700"
          />
        ) : product.image && imgError ? (
          <img
            src={aliexpressImageFallback(product.image)}
            alt={product.title}
            className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200 dark:ring-slate-700"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-3xl dark:bg-slate-800">
            📦
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight">{product.title}</p>
          </div>

          {/* Prix réel AliExpress ou estimation IA */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {product.aliPrice && (
              <span className="rounded-md bg-green-100 px-2 py-0.5 font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
                AliExpress · {product.aliPrice}
              </span>
            )}
            {!product.aliPrice && product.estPrice && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Est. {product.estPrice}
              </span>
            )}
            {product.aliUrl && (
              <a
                href={product.aliUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
              >
                Voir <ExternalLink size={11} />
              </a>
            )}
          </div>

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
          <button
            onClick={() => onAnalyze(product)}
            className="btn-ghost flex-1 py-1.5 text-xs"
          >
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
