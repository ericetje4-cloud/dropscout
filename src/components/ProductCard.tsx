// ===========================================================================
// ProductCard : carte de produit réutilisable (watchlist + dashboard).
// ===========================================================================

import { ExternalLink } from 'lucide-react';
import type { Product } from '@/types';
import { formatMoney } from '@/lib/format';
import { ScoreBar, scoreColor } from '@/components/ui';

const STATUS_META: Record<Product['status'], { label: string; cls: string }> = {
  idea: { label: '💡 Idée', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  testing: { label: '🧪 À tester', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  winner: { label: '🏆 Gagnant', cls: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' },
  dropped: { label: '❌ Abandonné', cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
};

export function StatusBadge({ status }: { status: Product['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const score = product.score?.total;
  return (
    <div className="card p-3">
      <div className="flex gap-3">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl dark:bg-slate-800">
            📦
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{product.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={product.status} />
                {product.niche && (
                  <span className="truncate text-xs text-slate-400">{product.niche}</span>
                )}
              </div>
            </div>
            {score != null && (
              <div className="flex shrink-0 flex-col items-center">
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: scoreColor(score) }}
                >
                  {score}
                </span>
                <span className="text-[10px] text-slate-400">/100</span>
              </div>
            )}
          </div>

          {product.score && (
            <div className="mt-2">
              <ScoreBar score={product.score.total} />
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {product.costPrice != null && (
              <span>Achat {formatMoney(product.costPrice)}</span>
            )}
            {product.sellPrice != null && (
              <span>Revente {formatMoney(product.sellPrice)}</span>
            )}
            {product.marginPct != null && (
              <span className="font-semibold text-green-600 dark:text-green-400">
                {Math.round(product.marginPct * 100)}% marge
              </span>
            )}
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
              >
                Source <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { STATUS_META };
