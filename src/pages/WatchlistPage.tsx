// ===========================================================================
// Page Watchlist : tous les produits suivis, filtrables par statut.
// ===========================================================================

import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ProductCard, STATUS_META } from '@/components/ProductCard';
import { ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { useStore, removeProduct, updateProduct } from '@/hooks/useStore';
import type { ProductStatus } from '@/types';

const FILTERS: { key: ProductStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'idea', label: '💡 Idées' },
  { key: 'testing', label: '🧪 À tester' },
  { key: 'winner', label: '🏆 Gagnants' },
  { key: 'dropped', label: '❌ Abandonnés' },
];

export function WatchlistPage() {
  const { products } = useStore();
  const { toast } = useToast();
  const [filter, setFilter] = useState<ProductStatus | 'all'>('all');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const filtered = filter === 'all' ? products : products.filter((p) => p.status === filter);

  async function cycleStatus(id: string, current: ProductStatus) {
    const next: ProductStatus =
      current === 'idea'
        ? 'testing'
        : current === 'testing'
          ? 'winner'
          : current === 'winner'
            ? 'dropped'
            : 'idea';
    await updateProduct(id, { status: next });
    setMenuFor(null);
    toast(`Statut : ${STATUS_META[next].label}`, 'info');
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await removeProduct(toDelete);
    setToDelete(null);
    toast('Produit supprimé.', 'success');
  }

  return (
    <Layout title="Watchlist">
      {/* Filtres */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? products.length : products.filter((p) => p.status === f.key).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {f.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="⭐"
            title="Watchlist vide"
            description="Ajoutez des produits depuis l'analyse ou l'agent."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="relative">
              <div
                onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                className="cursor-pointer"
              >
                <ProductCard product={p} />
              </div>
              {menuFor === p.id && (
                <div className="absolute right-2 top-2 z-10 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void cycleStatus(p.id, p.status);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Changer statut → <Star size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete(p.id);
                      setMenuFor(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce produit ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </Layout>
  );
}
