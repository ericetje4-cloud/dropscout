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
import { NicheProductCard } from '@/components/NicheProductCard';
import { addProduct, useStore, addNiche, removeNiche } from '@/hooks/useStore';
import { getSetting, setSetting } from '@/lib/db';
import {
  analyzeProduct,
  researchNiche,
  enrichNicheReport,
  parseStoredReport,
  type NicheReport,
  type NicheProduct,
} from '@/lib/research';
import { refreshNiche } from '@/lib/refresh';
import { getConfiguredSuppliers } from '@/lib/suppliers/registry';
import { scoreProduct } from '@/lib/scoring';
import { computeMargin } from '@/lib/scoring';
import { formatMoney, formatRelative, getDisplayCurrency, toISODate } from '@/lib/format';
import { hasApiKey } from '@/lib/gemini';
import type { Niche, ProductScore, SupplierId } from '@/types';

type Tab = 'analyze' | 'niche' | 'watched';

export function DiscoverPage() {
  const [tab, setTab] = useState<Tab>('analyze');
  const [pendingAnalyze, setPendingAnalyze] = useState<string | null>(null);
  const { niches } = useStore();
  const watchedCount = niches.length;

  // Un produit envoyé depuis la veille (niche/watched) → bascule sur l'onglet
  // analyse et pré-remplit l'input.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        setPendingAnalyze(detail);
        setTab('analyze');
      }
    };
    window.addEventListener('dropscout:analyze', handler);
    return () => window.removeEventListener('dropscout:analyze', handler);
  }, []);

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
        <AnalyzePanel
          pendingInput={pendingAnalyze}
          onConsumed={() => setPendingAnalyze(null)}
        />
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
  /** true si l'IA était indisponible (quota/pas de clé) → score local seul. */
  degraded?: boolean;
}

function AnalyzePanel({
  pendingInput,
  onConsumed,
}: {
  pendingInput?: string | null;
  onConsumed?: () => void;
}) {
  const { toast } = useToast();
  const [product, setProduct] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState(false);

  // Pré-remplit l'input quand un produit arrive de l'onglet veille.
  useEffect(() => {
    if (pendingInput) {
      setProduct(pendingInput);
      setResult(null);
      onConsumed?.();
    }
  }, [pendingInput, onConsumed]);

  async function run() {
    if (!product.trim()) {
      toast('Décris le produit ou colle une URL.', 'warning');
      return;
    }
    setBusy(true);
    setSaved(false);
    setResult(null);

    const cost = costPrice ? Number(costPrice) : undefined;
    const sell = sellPrice ? Number(sellPrice) : undefined;
    const input = product.trim();

    // --- Tentative analyse IA complète ---
    if (hasApiKey()) {
      try {
        const analysis = await analyzeProduct({
          input,
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
          input,
          degraded: false,
        });
        return;
      } catch (e) {
        const msg = (e as Error).message;
        const quota = msg.includes('429') || msg.toLowerCase().includes('quota');
        // Mode dégradé : on calcule quand même le score local (marge + prix).
        const localScore = scoreProduct({ costPrice: cost, sellPrice: sell });
        setResult({
          report: quota
            ? '⚠️ Quota Gemini atteint — analyse IA indisponible pour le moment.\n\n' +
              'Voici le score basé sur la marge et le prix (les critères IA demande/concurrence/timing ' +
              'sont estimés à neutre 50/100). Relance l\'analyse complète quand le quota sera remonté ' +
              '(demain 9h ou dans 1 min si quota minute).'
            : `⚠️ Analyse IA échouée : ${msg}\n\nScore local basé sur la marge et le prix.`,
          score: localScore,
          adHooks: [],
          costPrice: cost,
          sellPrice: sell,
          input,
          degraded: true,
        });
        toast(
          quota
            ? 'Quota Gemini atteint — score local affiché (mode dégradé).'
            : 'Analyse IA échouée — score local affiché.',
          quota ? 'warning' : 'error',
        );
        return;
      } finally {
        setBusy(false);
      }
    }

    // --- Pas de clé du tout : score local uniquement ---
    const localScore = scoreProduct({ costPrice: cost, sellPrice: sell });
    setResult({
      report:
        '💡 Mode sans IA : score basé uniquement sur la marge et le prix.\n' +
        'Ajoute une clé Gemini dans les Réglages pour une analyse complète ' +
        '(demande, concurrence, timing, accroches pub).',
      score: localScore,
      adHooks: [],
      costPrice: cost,
      sellPrice: sell,
      input,
      degraded: true,
    });
    setBusy(false);
    toast('Score local calculé (sans IA).', 'info');
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
      {/* Bandeau mode dégradé (IA indisponible) */}
      {result.degraded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          ⚠️ Mode dégradé : score basé sur la marge/prix uniquement (IA indisponible).
          Les critères demande/concurrence/timing sont estimés à neutre (50/100).
        </div>
      )}

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
// Panneau veille de niche (rapport structuré + enrichissement AliExpress)
// ---------------------------------------------------------------------------

function NichePanel() {
  const { toast } = useToast();
  const { niches } = useStore();
  const [niche, setNiche] = useState('');
  const [region, setRegion] = useState('FR');
  const [phase, setPhase] = useState<'idle' | 'researching' | 'enriching'>('idle');
  const [watching, setWatching] = useState(false);
  const [result, setResult] = useState<NicheReport | null>(null);
  const [availableSuppliers, setAvailableSuppliers] = useState<SupplierId[]>([]);

  // Détecte les fournisseurs configurés au montage.
  useEffect(() => {
    void getConfiguredSuppliers().then(setAvailableSuppliers);
  }, []);

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
    setResult(null);
    setPhase('researching');
    try {
      const report = await researchNiche(niche.trim(), region || 'FR');

      // Enrichissement multi-fournisseurs (photos/prix réels) si ≥1 dispo.
      if (availableSuppliers.length > 0 && report.products.length > 0) {
        setPhase('enriching');
        try {
          await enrichNicheReport(report);
        } catch {
          // Non fatal : on garde le rapport non enrichi.
        }
      }
      setResult(report);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPhase('idle');
    }
  }

  async function watch() {
    if (!niche.trim() || !result) return;
    setWatching(true);
    try {
      await addNiche({
        label: niche.trim(),
        region: region || 'FR',
        lastReport: JSON.stringify(result),
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

  function analyzeProductFromNiche(p: NicheProduct) {
    // Pousse le produit dans l'onglet "Analyser" via un état partagé simple :
    // on navigue vers l'onglet analyse avec le titre pré-rempli.
    const input = p.aliUrl ?? p.title;
    window.dispatchEvent(new CustomEvent('dropscout:analyze', { detail: input }));
    toast('Produit envoyé vers l’analyse → onglet « Analyser »', 'info');
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

      <button onClick={() => void run()} disabled={phase !== 'idle'} className="btn-primary w-full">
        {phase !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Telescope size={16} />}
        {phase === 'researching'
          ? 'Veille en cours…'
          : phase === 'enriching'
            ? `Recherche chez ${availableSuppliers.length} fournisseur(s)…`
            : 'Lancer la veille'}
      </button>

      {availableSuppliers.length === 0 && hasApiKey() && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          ℹ️ Aucun fournisseur configuré : la veille affichera les produits sans
          photos ni prix réels. Voir <code>proxy/README.md</code> pour activer
          AliExpress / CJ / eBay.
        </p>
      )}

      {result && <NicheReportView report={result} nicheLabel={niche} onWatch={watch} watching={watching} alreadyWatched={alreadyWatched} onAnalyzeProduct={analyzeProductFromNiche} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Affichage d'un rapport de veille structuré
// ---------------------------------------------------------------------------

function NicheReportView({
  report,
  nicheLabel,
  onWatch,
  watching,
  alreadyWatched,
  onAnalyzeProduct,
}: {
  report: NicheReport;
  nicheLabel: string;
  onWatch: () => void;
  watching: boolean;
  alreadyWatched: boolean;
  onAnalyzeProduct: (p: NicheProduct) => void;
}) {
  const enrichedCount = report.products.filter((p) => p.image).length;
  return (
    <div className="space-y-3">
      {/* Synthèse */}
      <div className="card space-y-3 p-4">
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">
            Synthèse — « {nicheLabel} »
          </p>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {report.summary}
          </p>
        </div>

        {report.trends.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">Sous-tendances</p>
            <div className="flex flex-wrap gap-1.5">
              {report.trends.map((t, i) => (
                <span key={i} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {report.seasons && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">Saisons / événements</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{report.seasons}</p>
          </div>
        )}

        {report.sources.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-400">
              Sources ({report.sources.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {report.sources.slice(0, 8).map((s, i) => (
                <li key={i}>
                  <a href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400">
                    <ExternalLink size={11} /> {s}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Produits */}
      {report.products.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold">
              {report.products.length} idée(s) de produits
            </h3>
            {enrichedCount > 0 && (
              <span className="text-xs text-slate-400">
                {enrichedCount} avec photo AliExpress
              </span>
            )}
          </div>
          {report.products.map((p, i) => (
            <NicheProductCard key={i} product={p} niche={nicheLabel} onAnalyze={onAnalyzeProduct} />
          ))}
        </div>
      )}

      {/* Surveiller */}
      <button
        onClick={onWatch}
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

  // Sépare les catégories surveillées (système) des niches utilisateur.
  const categories = niches.filter((n) => n.origin === 'category');
  const userNiches = niches.filter((n) => n.origin !== 'category');
  const trendsCount = categories.filter((n) => n.trendEmerging).length;

  return (
    <div className="space-y-4">
      {/* Section : Catégories surveillées (auto) */}
      {categories.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Telescope size={15} className="text-brand-600" /> Catégories surveillées
            </h3>
            {trendsCount > 0 && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                🔥 {trendsCount} tendance{trendsCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {categories.map((n) => (
            <WatchedNicheCard
              key={n.id}
              n={n}
              seenAt={seenAt}
              refreshing={refreshingId === n.id}
              onRefresh={() => void refreshOne(n)}
            />
          ))}
        </section>
      )}

      {/* Section : Vos niches (manuelles) */}
      {userNiches.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Vos niches
          </h3>
          {userNiches.map((n) => (
            <WatchedNicheCard
              key={n.id}
              n={n}
              seenAt={seenAt}
              refreshing={refreshingId === n.id}
              onRefresh={() => void refreshOne(n)}
              onRemove={() => void removeNiche(n.id).then(() => toast('Niche retirée.', 'info'))}
            />
          ))}
        </section>
      )}

      {userNiches.length === 0 && categories.length > 0 && (
        <p className="px-1 text-xs text-slate-400">
          Lance une veille dans l'onglet « Veiller » puis clique « Surveiller » pour
          ajouter tes propres niches.
        </p>
      )}
    </div>
  );
}

/** Carte d'une niche surveillée (catégorie ou utilisateur). */
function WatchedNicheCard({
  n,
  seenAt,
  refreshing,
  onRefresh,
  onRemove,
}: {
  n: Niche;
  seenAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  onRemove?: () => void;
}) {
  const lastTs = n.lastCheckedAt ? new Date(n.lastCheckedAt).getTime() : 0;
  const isNew = lastTs > seenAt && seenAt > 0;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{n.label}</p>
            {n.trendEmerging && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                🔥 Tendance
              </span>
            )}
            {isNew && !n.trendEmerging && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
                🆕 Actualisé
              </span>
            )}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">
              {n.region}
            </span>
          </div>
          {n.trendReason && (
            <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-400">
              {n.trendReason}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {n.lastCheckedAt
              ? `Dernière veille ${formatRelative(n.lastCheckedAt)}`
              : 'Jamais rafraichie — le sera au prochain cycle'}
          </p>
        </div>
      </div>

      {n.lastReport && <WatchedReport niche={n} />}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="btn-secondary flex-1 text-xs"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <Telescope size={13} />}
          Rafraîchir
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-xl bg-red-50 p-2.5 text-red-600 hover:bg-red-100 dark:bg-red-950/30"
            aria-label="Ne plus surveiller"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Affiche le rapport stocké d'une niche surveillée (rétro-compatible : texte
 * brut si ancien format, cartes produits avec images si nouveau format).
 */
function WatchedReport({ niche }: { niche: Niche }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const report = parseStoredReport(niche.lastReport);

  if (!report) return null;

  const hasProducts = report.products.length > 0;

  function analyzeProduct(p: NicheProduct) {
    window.dispatchEvent(
      new CustomEvent('dropscout:analyze', { detail: p.aliUrl ?? p.title }),
    );
    toast('Produit envoyé vers l’analyse → onglet « Analyser »', 'info');
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
        {report.summary}
      </p>

      {hasProducts && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {expanded ? 'Masquer les produits' : `${report.products.length} produit(s) — afficher`}
          </button>
          {expanded && (
            <div className="space-y-2">
              {report.products.map((p, i) => (
                <NicheProductCard key={i} product={p} niche={niche.label} onAnalyze={analyzeProduct} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
