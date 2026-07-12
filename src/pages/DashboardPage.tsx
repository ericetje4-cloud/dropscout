// ===========================================================================
// Page Dashboard : vue d'ensemble (scores, produits gagnants, niches, boutiques).
// ===========================================================================

import { Telescope, Star, Store, TrendingUp, Trophy, Plus } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/hooks/useStore';
import { useNavigation } from '@/hooks/useNavigation';
import { formatMoney } from '@/lib/format';

export function DashboardPage() {
  const { products, niches, shops } = useStore();
  const { navigate } = useNavigation();

  const winners = products.filter((p) => p.status === 'winner');
  const ideas = products.filter((p) => p.status === 'idea');
  const avgScore =
    products.length > 0 && products.some((p) => p.score)
      ? Math.round(
          products.filter((p) => p.score).reduce((s, p) => s + (p.score!.total), 0) /
            products.filter((p) => p.score).length,
        )
      : null;

  const totalMargin = products.reduce((s, p) => s + (p.margin ?? 0), 0);

  return (
    <Layout title="DropScout" actions={
      <button
        onClick={() => navigate('discover')}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        <Plus size={14} /> Analyser
      </button>
    }>
      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Trophy size={18} />}
          label="Gagnants"
          value={String(winners.length)}
          color="text-green-600"
        />
        <StatCard
          icon={<Star size={18} />}
          label="En watchlist"
          value={String(products.length)}
          color="text-brand-600"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Score moyen"
          value={avgScore != null ? `${avgScore}` : '—'}
          color="text-amber-600"
        />
        <StatCard
          icon={<Telescope size={18} />}
          label="Niches"
          value={String(niches.length)}
          color="text-purple-600"
        />
      </div>

      {/* Marge potentielle totale */}
      {totalMargin > 0 && (
        <div className="card mt-3 flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-slate-400">Marge potentielle cumulée</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {formatMoney(totalMargin)}
            </p>
          </div>
          <TrendingUp size={28} className="text-green-500/40" />
        </div>
      )}

      {/* Produits gagnants récents */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy size={16} className="text-green-600" /> Produits gagnants
          </h2>
          {winners.length > 0 && (
            <button onClick={() => navigate('watchlist')} className="text-xs text-brand-600 hover:underline">
              Tout voir
            </button>
          )}
        </div>
        {winners.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="🏆"
              title="Pas encore de gagnant"
              description="Découvrez et analysez des produits, puis marquez les meilleurs comme gagnants."
            />
          </div>
        ) : (
          <div className="space-y-2">
            {winners.slice(0, 3).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Idées récentes */}
      {ideas.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Star size={16} className="text-amber-500" /> Dernières idées
          </h2>
          <div className="space-y-2">
            {ideas.slice(0, 3).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Raccourcis */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('discover')}
          className="card flex flex-col items-start gap-2 p-4 text-left transition-colors hover:border-brand-300"
        >
          <Telescope size={20} className="text-brand-600" />
          <span className="text-sm font-medium">Découvrir des produits</span>
          <span className="text-xs text-slate-400">Veille par niche + analyse</span>
        </button>
        <button
          onClick={() => navigate('shops')}
          className="card flex flex-col items-start gap-2 p-4 text-left transition-colors hover:border-brand-300"
        >
          <Store size={20} className="text-brand-600" />
          <span className="text-sm font-medium">Mes boutiques</span>
          <span className="text-xs text-slate-400">
            {shops.length > 0 ? `${shops.length} connectée(s)` : 'Non configuré'}
          </span>
        </button>
      </section>

      <div className="mt-4" />
    </Layout>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card p-3">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
