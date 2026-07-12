// ===========================================================================
// Page Discover : 2 actions phares du Pilier A.
//   1. Analyse d'un produit (URL ou description) → score IA + rapport.
//   2. Veille d'une niche (Google Search grounding) → rapport + sources.
// ===========================================================================

import { useState } from 'react';
import { Telescope, Sparkles, Loader2, ExternalLink, Save } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Field, ScoreBar, scoreColor, useToast, EmptyState } from '@/components/ui';
import { addProduct } from '@/hooks/useStore';
import { analyzeProduct, researchNiche } from '@/lib/research';
import { scoreProduct } from '@/lib/scoring';
import { computeMargin } from '@/lib/scoring';
import { formatMoney, getDisplayCurrency } from '@/lib/format';
import { hasApiKey } from '@/lib/gemini';
import type { ProductScore } from '@/types';

type Tab = 'analyze' | 'niche';

export function DiscoverPage() {
  const [tab, setTab] = useState<Tab>('analyze');
  return (
    <Layout title="Découvrir">
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          onClick={() => setTab('analyze')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'analyze' ? 'bg-white shadow-card dark:bg-slate-900' : 'text-slate-500'
          }`}
        >
          <Sparkles size={15} /> Analyser un produit
        </button>
        <button
          onClick={() => setTab('niche')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'niche' ? 'bg-white shadow-card dark:bg-slate-900' : 'text-slate-500'
          }`}
        >
          <Telescope size={15} /> Veiller une niche
        </button>
      </div>

      {tab === 'analyze' ? <AnalyzePanel /> : <NichePanel />}
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
  const [niche, setNiche] = useState('');
  const [region, setRegion] = useState('FR');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NicheResult | null>(null);

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
        </div>
      )}
    </div>
  );
}
