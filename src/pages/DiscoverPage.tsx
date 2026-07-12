// ===========================================================================
// Page Discover : 3 actions du Pilier A.
//   1. Analyse d'un produit (URL ou description) → score IA + rapport.
//   2. Veille d'une niche (Google Search grounding) → rapport + sources.
//   3. Surveillées : niches suivies, rafraîchies automatiquement.
// ===========================================================================

import { useEffect, useState } from 'react';
import { Telescope, Sparkles, Loader2, ExternalLink, Save, Bell, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Field, ScoreBar, scoreColor, useToast, EmptyState } from '@/components/ui';
import { addProduct, useStore, addNiche, removeNiche } from '@/hooks/useStore';
import { getSetting, setSetting } from '@/lib/db';
import { analyzeProduct, researchNiche } from '@/lib/research';
import { refreshNiche } from '@/lib/refresh';
import { scoreProduct } from '@/lib/scoring';
import { computeMargin } from '@/lib/scoring';
import { formatMoney, formatRelative, getDisplayCurrency, toISODate } from '@/lib/format';
import { hasApiKey } from '@/lib/gemini';
import type { Niche, ProductScore } from '@/types';

type Tab = 'analyze' | 'niche' | 'watched';

export function DiscoverPage() {
  const [tab, setTab] = useState<Tab>('analyze');
  const { niches } = useStore();
  const watchedCount = niches.length;

  return (
    <Layout title="Découvrir">
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          onClick={() => setTab('analyze')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors sm:text-sm ${
            tab === 'analyze' ? 'bg-white shadow-card dark:bg-slate-900' : 'text-slate-500'
          }`}
        >
          <Sparkles size={15} /> Analyser
        </button>
        <button
          onClick={() => setTab('niche')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors sm:text-sm ${
            tab === 'niche' ? 'bg-white shadow-card dark:bg-slate-900' : 'text-slate-500'
          }`}
        >
          <Telescope size={15} /> Veiller
        </button>
        <button
          onClick={() => setTab('watched')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors sm:text-sm ${
            tab === 'watched' ? 'bg-white shadow-card dark:bg-slate-900' : 'text-slate-500'
          }`}
        >
          <Bell size={15} /> Surveillées
          {watchedCount > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">
              {watchedCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'analyze' ? (
        <AnalyzePanel />
      ) : tab === 'niche' ? (
        <NichePanel />
      ) : (
        <WatchedPanel />
      )}
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Panneau analyse de produit
// ---------------------------------------------------------------------------

interface AnalysisResult {
  report: string;
  score: ProductScore;
  adHooks: string[];
  costPrice?: number;
  sellPrice?: number;
  input: string;
}

function AnalyzePanel() {
  const { toast } = useToast();
  const [product, setProduct] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState(false);

  async function run() {
    if (!product.trim()) {
      toast('Décris le produit ou colle une URL.', 'warning');
      return;
    }
    if (!hasApiKey()) {
      toast('Ajoute ta clé Gemini dans les Réglages.', 'warning');
      return;
    }
    setBusy(true);
    setSaved(false);
    setResult(null);
    try {
      const cost = costPrice ? Number(costPrice) : undefined;
      const sell = sellPrice ? Number(sellPrice) : undefined;
      const analysis = await analyzeProduct({
        input: product.trim(),
        costPrice: cost,
        sellPrice: sell,
        currency: getDisplayCurrency(),
      });
      const score = scoreProduct({
        costPrice: cost,
        sellPrice: sell,
        demand: analysis.scores.demand,
        competition: analysis.scores.competition,
        seasonality: analysis.scores.seasonality,
      });
      setResult({
        report: analysis.report,
        score,
        adHooks: analysis.adHooks,
        costPrice: cost,
        sellPrice: sell,
        input: product.trim(),
      });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    const m = computeMargin(result.costPrice, result.sellPrice);
    await addProduct({
      title: result.input.startsWith('http') ? new URL(result.input).pathname.slice(1, 50) || 'Produit importé' : result.input.slice(0, 60),
      url: result.input.startsWith('http') ? result.input : undefined,
      costPrice: result.costPrice,
      sellPrice: result.sellPrice,
      score: result.score,
      margin: m?.margin,
      marginPct: m?.marginPct,
      status: 'idea',
      notes: result.adHooks.length > 0 ? `Accroches : ${result.adHooks.join(' | ')}` : undefined,
    });
    setSaved(true);
    toast('Produit ajouté à la watchlist 💡', 'success');
  }

  if (!hasApiKey()) {
    return (
      <div className="card">
        <EmptyState
          icon="🔑"
          title="Clé API requise"
          description="L'analyse IA nécessite une clé Gemini (gratuite). Ajoute-la dans les Réglages."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Produit" hint="Colle une URL AliExpress/Amazon ou décris le produit (titre, features, public cible).">
        <textarea
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          rows={3}
          placeholder="ex: Lampe LED coucher de soleil, publique : déco chambre Instagram"
          className="input resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Prix d'achat (${getDisplayCurrency()})`}>
          <input
            type="number"
            inputMode="decimal"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="ex: 8.50"
            className="input"
          />
        </Field>
        <Field label={`Prix de revente (${getDisplayCurrency()})`}>
          <input
            type="number"
            inputMode="decimal"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            placeholder="ex: 29.90"
            className="input"
          />
        </Field>
      </div>

      <button onClick={() => void run()} disabled={busy} className="btn-primary w-full">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {busy ? 'Analyse en cours…' : 'Analyser & scorer'}
      </button>

      {result && <AnalysisView result={result} saved={saved} onSave={save} />}
    </div>
  );
}

function AnalysisView({
  result,
  saved,
  onSave,
}: {
  result: AnalysisResult;
  saved: boolean;
  onSave: () => void;
}) {
  const { score } = result;
  const m = computeMargin(result.costPrice, result.sellPrice);

  return (
    <div className="card space-y-3 p-4">
      {/* Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Score gagnant</span>
        <span className="text-3xl font-bold tabular-nums" style={{ color: scoreColor(score.total) }}>
          {score.total}
          <span className="text-base text-slate-400">/100</span>
        </span>
      </div>
      <ScoreBar score={score.total} />

      {/* Sous-scores */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-xs">
        <SubScore label="Marge" value={score.margin} />
        <SubScore label="Demande" value={score.demand} />
        <SubScore label="Concurrence" value={score.competition} />
        <SubScore label="Timing" value={score.seasonality} />
      </div>

      {m && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm dark:bg-green-950/30">
          Marge estimée :{' '}
          <strong className="text-green-700 dark:text-green-400">
            {formatMoney(m.margin)} ({Math.round(m.marginPct * 100)}%)
          </strong>
        </div>
      )}

      {/* Rapport */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-400">Analyse</p>
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
          {result.report}
        </p>
      </div>

      {/* Accroches */}
      {result.adHooks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">Accroches publicitaires</p>
          <ul className="space-y-1">
            {result.adHooks.map((h, i) => (
              <li key={i} className="text-sm text-slate-700 dark:text-slate-200">
                • {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saved}
        className="btn-secondary w-full"
      >
        {saved ? (
          '✅ Dans la watchlist'
        ) : (
          <>
            <Save size={15} /> Ajouter à la watchlist
          </>
        )}
      </button>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: scoreColor(value) }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau veille de niche
// ---------------------------------------------------------------------------

interface NicheResult {
  report: string;
  sources: string[];
}

function NichePanel() {
  const { toast } = useToast();
  const { niches } = useStore();
  const [niche, setNiche] = useState('');
  const [region, setRegion] = useState('FR');
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [result, setResult] = useState<NicheResult | null>(null);

  // true si la niche courante est déjà surveillée.
  const alreadyWatched = niches.some(
    (n) => n.label.toLowerCase() === niche.trim().toLowerCase() && n.region === (region || 'FR'),
  );

  async function run() {
    if (!niche.trim()) {
      toast('Indique une niche.', 'warning');
      return;
    }
    if (!hasApiKey()) {
      toast('Ajoute ta clé Gemini dans les Réglages.', 'warning');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await researchNiche(niche.trim(), region || 'FR');
      setResult(r);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function watch() {
    if (!niche.trim() || !result) return;
    setWatching(true);
    try {
      await addNiche({
        label: niche.trim(),
        region: region || 'FR',
        lastReport: result.report,
        lastSources: result.sources,
        lastCheckedAt: toISODate(new Date()),
      });
      toast(`« ${niche.trim()} » est maintenant surveillée 🔔`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setWatching(false);
    }
  }

  if (!hasApiKey()) {
    return (
      <div className="card">
        <EmptyState
          icon="🔑"
          title="Clé API requise"
          description="La veille nécessite une clé Gemini (gratuite). Ajoute-la dans les Réglages."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Niche à explorer" hint="ex: gadgets cuisine, accessoires chiens, fitness maison">
        <input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="ex: gadget cuisine"
          className="input"
        />
      </Field>

      <Field label="Région ciblée">
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="input">
          <option value="FR">🇫🇷 France</option>
          <option value="US">🇺🇸 États-Unis</option>
          <option value="GB">🇬🇧 Royaume-Uni</option>
          <option value="DE">🇩🇪 Allemagne</option>
          <option value="CA">🇨🇦 Canada</option>
          <option value="WW">🌍 Monde entier</option>
        </select>
      </Field>

      <button onClick={() => void run()} disabled={busy} className="btn-primary w-full">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Telescope size={16} />}
        {busy ? 'Veille en cours…' : 'Lancer la veille'}
      </button>

      {result && (
        <div className="card space-y-3 p-4">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">
              Rapport de veille — « {niche} » ({region})
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {result.report}
            </p>
          </div>
          {result.sources.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">Sources</p>
              <ul className="space-y-1">
                {result.sources.slice(0, 8).map((s, i) => (
                  <li key={i}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      <ExternalLink size={11} /> {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Surveiller : ajoute la niche au rafraîchissement automatique */}
          <button
            onClick={() => void watch()}
            disabled={watching || alreadyWatched}
            className="btn-secondary w-full"
          >
            {alreadyWatched ? (
              '🔔 Déjà surveillée'
            ) : watching ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                <Bell size={15} /> Surveiller cette niche (auto-refresh)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau niches surveillées (rafraîchies automatiquement)
// ---------------------------------------------------------------------------

function WatchedPanel() {
  const { toast } = useToast();
  const { niches } = useStore();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [seenAt, setSeenAt] = useState<number>(0);

  // Charge le timestamp de dernière visite pour le badge "nouveauté".
  useEffect(() => {
    void getSetting('nichesSeenAt').then((t) => setSeenAt(t ?? 0));
  }, []);

  // Marque comme "vu" au montage du panneau.
  useEffect(() => {
    void setSetting('nichesSeenAt', Date.now());
  }, []);

  async function refreshOne(n: Niche) {
    if (!hasApiKey()) {
      toast('Ajoute ta clé Gemini dans les Réglages.', 'warning');
      return;
    }
    setRefreshingId(n.id);
    try {
      await refreshNiche(n);
      toast(`« ${n.label} » actualisée ✓`, 'success');
    } catch (e) {
      toast(`Échec : ${(e as Error).message}`, 'error');
    } finally {
      setRefreshingId(null);
    }
  }

  if (niches.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="🔔"
          title="Aucune niche surveillée"
          description="Lance une veille puis clique sur « Surveiller » pour qu'elle s'actualise automatiquement."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Les niches surveillées sont rafraîchies automatiquement (selon l'intervalle
        défini dans les Réglages). Ouvre l'app pour déclencher le rafraîchissement si
        l'arrière-plan n'est pas supporté.
      </p>
      {niches.map((n) => {
        const lastTs = n.lastCheckedAt ? new Date(n.lastCheckedAt).getTime() : 0;
        const isNew = lastTs > seenAt && seenAt > 0;
        return (
          <div key={n.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{n.label}</p>
                  {isNew && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
                      🆕 Actualisé
                    </span>
                  )}
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">
                    {n.region}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {n.lastCheckedAt
                    ? `Dernière veille ${formatRelative(n.lastCheckedAt)}`
                    : 'Jamais rafraîchie'}
                </p>
              </div>
            </div>

            {n.lastReport && (
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                {n.lastReport}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void refreshOne(n)}
                disabled={refreshingId === n.id}
                className="btn-secondary flex-1 text-xs"
              >
                {refreshingId === n.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Telescope size={13} />
                )}
                Rafraîchir
              </button>
              <button
                onClick={() => void removeNiche(n.id).then(() => toast('Niche retirée.', 'info'))}
                className="rounded-xl bg-red-50 p-2.5 text-red-600 hover:bg-red-100 dark:bg-red-950/30"
                aria-label="Ne plus surveiller"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
