// ===========================================================================
// Page Réglages : thème, clé Gemini (+test), modèle, devise, proxy boutiques,
// export/import JSON, réinitialisation, infos PWA.
// ===========================================================================

import { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Monitor,
  Download,
  Upload,
  Trash2,
  Database,
  Shield,
  Info,
  Loader2,
  RefreshCw,
  Share2,
  Store,
} from 'lucide-react';
import { useStore, exportStore, importStore, resetStore } from '@/hooks/useStore';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { Layout } from '@/components/Layout';
import { ConfirmDialog, Field, useToast } from '@/components/ui';
import { getSetting, setSetting } from '@/lib/db';
import { clearAppCaches } from '@/lib/pwa';
import {
  setApiKey,
  setModel,
  testApiKey,
  hasApiKey,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
} from '@/lib/gemini';
import { setDisplayCurrency, getDisplayCurrency } from '@/lib/format';
import type { BackupPayload } from '@/types';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'CHF'];

export function SettingsPage() {
  const { products, niches, shops } = useStore();
  const { mode, changeMode } = useTheme();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [clearCacheOpen, setClearCacheOpen] = useState(false);

  // IA
  const [keyInput, setKeyInput] = useState('');
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [testing, setTesting] = useState(false);

  // Général
  const [currency, setCurrencyState] = useState('EUR');
  const [proxyUrl, setProxyUrl] = useState('');

  useEffect(() => {
    (async () => {
      const k = await getSetting('geminiKey');
      if (k) setKeyInput(k);
      const m = await getSetting('geminiModel');
      setModelState(m ?? DEFAULT_MODEL);
      const c = await getSetting('currency');
      if (c) setCurrencyState(c);
      const p = await getSetting('proxyUrl');
      if (p) setProxyUrl(p);
    })();
  }, []);

  async function saveKey() {
    const trimmed = keyInput.trim();
    await setSetting('geminiKey', trimmed);
    setApiKey(trimmed);
    toast(trimmed ? 'Clé Gemini enregistrée ✓' : 'Clé effacée.', trimmed ? 'success' : 'info');
  }

  async function tryKey() {
    if (!keyInput.trim()) {
      toast("Saisis d'abord une clé.", 'warning');
      return;
    }
    setTesting(true);
    const result = await testApiKey(keyInput.trim(), model);
    setTesting(false);
    if (result.ok) toast('Clé valide ✓', 'success');
    else toast(`Clé invalide : ${result.message}`, 'error');
  }

  async function changeModel(m: string) {
    setModelState(m);
    await setSetting('geminiModel', m);
    setModel(m);
  }

  async function changeCurrency(c: string) {
    setCurrencyState(c);
    setDisplayCurrency(c);
    await setSetting('currency', c);
  }

  async function saveProxy() {
    const trimmed = proxyUrl.trim().replace(/\/$/, '');
    await setSetting('proxyUrl', trimmed);
    toast(trimmed ? 'Proxy enregistré ✓' : 'Proxy effacé.', trimmed ? 'success' : 'info');
  }

  async function doExport() {
    const payload = await exportStore();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dropscout-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Sauvegarde exportée ✓', 'success');
  }

  async function onImportFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const text = await files[0].text();
      const payload = JSON.parse(text) as BackupPayload;
      if (payload.app !== 'dropscout') {
        toast("Ce fichier n'est pas une sauvegarde DropScout.", 'error');
        return;
      }
      await importStore(payload, true);
      toast('Données importées ✓', 'success');
    } catch {
      toast('Fichier invalide.', 'error');
    }
  }

  async function doReset() {
    await resetStore();
    setResetOpen(false);
    toast('Données réinitialisées.', 'success');
  }

  async function doClearCache() {
    await clearAppCaches();
    setClearCacheOpen(false);
    toast('Cache vidé. Rechargement…', 'success');
    setTimeout(() => window.location.reload(), 800);
  }

  function shareApp() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: 'DropScout', text: 'Mon assistant dropshipping', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      toast('Lien copié ✓', 'success');
    }
  }

  return (
    <Layout title="Réglages">
      <div className="space-y-5">
        {/* Thème */}
        <Section title="Apparence">
          <div className="flex gap-2">
            {([
              ['light', 'Clair', Sun],
              ['dark', 'Sombre', Moon],
              ['system', 'Système', Monitor],
            ] as [ThemeMode, string, typeof Sun][]).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => void changeMode(m)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border-slate-200 text-slate-500 dark:border-slate-700'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </Section>

        {/* IA Gemini */}
        <Section title="Intelligence artificielle" icon={<Info size={15} />}>
          <Field
            label="Clé API Gemini"
            hint="Clé gratuite AI Studio (ai.google.dev). Stockée localement sur cet appareil."
            required
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIza..."
                className="input"
                autoComplete="off"
              />
              <button onClick={() => void tryKey()} disabled={testing} className="btn-secondary shrink-0">
                {testing ? <Loader2 size={15} className="animate-spin" /> : 'Tester'}
              </button>
            </div>
          </Field>
          <button onClick={() => void saveKey()} className="btn-primary w-full">
            Enregistrer la clé
          </button>

          <Field label="Modèle">
            <select value={model} onChange={(e) => void changeModel(e.target.value)} className="input">
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.hint}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-400">
            État : {hasApiKey() ? '🟢 Clé active' : '🔴 Aucune clé'}
          </p>
        </Section>

        {/* Devise */}
        <Section title="Devise">
          <Field label="Devise d'affichage">
            <select value={currency} onChange={(e) => void changeCurrency(e.target.value)} className="input">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-slate-400">Actuelle : {getDisplayCurrency()}</p>
        </Section>

        {/* Proxy boutiques */}
        <Section title="Connexion boutiques" icon={<Store size={15} />}>
          <Field
            label="URL du proxy (Cloudflare Worker)"
            hint="Requis pour connecter Shopify / WooCommerce. Voir proxy/README.md pour le déploiement."
          >
            <input
              type="url"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="https://dropscout-proxy.votre-sous-domaine.workers.dev"
              className="input"
            />
          </Field>
          <button onClick={() => void saveProxy()} className="btn-secondary w-full">
            Enregistrer le proxy
          </button>
          <p className="text-xs text-slate-400">{shops.length} boutique(s) configurée(s).</p>
        </Section>

        {/* Données */}
        <Section title="Données" icon={<Database size={15} />}>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void doExport()} className="btn-secondary">
              <Download size={15} /> Exporter
            </button>
            <button onClick={() => fileInput.current?.click()} className="btn-secondary">
              <Upload size={15} /> Importer
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                void onImportFile(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {products.length} produits • {niches.length} niches • {shops.length} boutiques
          </p>
          <button
            onClick={() => setResetOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400"
          >
            <Trash2 size={15} /> Tout réinitialiser
          </button>
        </Section>

        {/* Avancé */}
        <Section title="Avancé" icon={<Shield size={15} />}>
          <button
            onClick={() => setClearCacheOpen(true)}
            className="btn-ghost flex w-full items-center justify-center gap-2"
          >
            <RefreshCw size={15} /> Vider le cache (forcer MAJ)
          </button>
          <button
            onClick={shareApp}
            className="btn-ghost flex w-full items-center justify-center gap-2"
          >
            <Share2 size={15} /> Partager l'app
          </button>
        </Section>

        {/* À propos */}
        <div className="px-1 pb-4 text-center text-xs text-slate-400">
          DropScout v{__APP_VERSION__} — veille & gestion dropshipping
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Tout réinitialiser ?"
        message="Tous les produits, niches et boutiques seront définitivement effacés."
        confirmLabel="Réinitialiser"
        danger
        onConfirm={() => void doReset()}
        onCancel={() => setResetOpen(false)}
      />
      <ConfirmDialog
        open={clearCacheOpen}
        title="Vider le cache ?"
        message="L'app rechargera sa dernière version. Vos données sont préservées."
        confirmLabel="Vider & recharger"
        onConfirm={() => void doClearCache()}
        onCancel={() => setClearCacheOpen(false)}
      />
    </Layout>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}
