// ===========================================================================
// Onboarding : parcours de premier lancement.
// Étapes : Bienvenue → Clé Gemini → Installer l'app → (Proxy optionnel) → Fin
// Détecte Android/iOS/desktop pour des conseils d'installation ciblés.
// ===========================================================================

import { useState } from 'react';
import {
  Telescope,
  Sparkles,
  KeyRound,
  Download,
  Store,
  Check,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { Field, useToast } from '@/components/ui';
import { setApiKey, testApiKey, DEFAULT_MODEL } from '@/lib/gemini';
import { setSetting } from '@/lib/db';
import { isInstalled } from '@/lib/background-sync';

type Platform = 'android' | 'ios' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua) || (/mac/.test(ua) && 'ontouchend' in document)) return 'ios';
  return 'desktop';
}

export function OnboardingPage({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const platform = detectPlatform();
  const [alreadyInstalled] = useState(() => isInstalled());
  // true quand la clé a été testée ET validée dans l'étape key.
  const [keyValid, setKeyValid] = useState(false);

  // Étapes dynamiques : on saute l'installation si déjà installée.
  const steps = buildSteps(platform, alreadyInstalled, setKeyValid);
  const total = steps.length;
  const current = steps[step];
  const isLast = step === total - 1;

  async function next() {
    // L'étape clé Gemini exige une clé testée valide avant de passer.
    if (current.id === 'key' && !keyValid) {
      // Pas de toast ici (useToast est dans KeyForm) : on laisse le bouton
      // "Tester la clé" faire le travail.
      return;
    }
    if (isLast) {
      await setSetting('hasCompletedOnboarding', true);
      onDone();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  function skip() {
    // Skip disponible sur les étapes optionnelles (proxy, install).
    if (current.optional) {
      if (isLast) {
        void setSetting('hasCompletedOnboarding', true).then(onDone);
      } else {
        setStep((s) => s + 1);
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* En-tête : progression */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="mx-auto flex max-w-md gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex flex-1 flex-col justify-center px-5 py-8">
        <div className="mx-auto w-full max-w-md">
          {current.content}
        </div>
      </div>

      {/* Pied : navigation */}
      <div className="flex items-center gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          {step > 0 && (
            <button onClick={back} className="btn-ghost px-3 py-2.5">
              <ChevronLeft size={18} />
            </button>
          )}
          {current.optional && !isLast && (
            <button onClick={skip} className="btn-ghost flex-1 py-2.5 text-sm">
              Plus tard
            </button>
          )}
          <button onClick={() => void next()} className="btn-primary flex-[2] py-2.5">
            {isLast ? (
              <>
                <Check size={18} /> C'est parti
              </>
            ) : (
              <>
                {current.id === 'key' ? 'Tester & continuer' : 'Continuer'}
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Définition des étapes
// ---------------------------------------------------------------------------

interface Step {
  id: string;
  optional?: boolean;
  content: React.ReactNode;
}

function buildSteps(
  platform: Platform,
  alreadyInstalled: boolean,
  setKeyValid: (v: boolean) => void,
): Step[] {
  const steps: Step[] = [{ id: 'welcome', content: <WelcomeStep /> }];

  steps.push({ id: 'key', content: <KeyStep onValidated={() => setKeyValid(true)} /> });

  if (!alreadyInstalled) {
    steps.push({ id: 'install', optional: true, content: <InstallStep platform={platform} /> });
  }

  steps.push({ id: 'proxy', optional: true, content: <ProxyStep /> });
  steps.push({ id: 'done', content: <DoneStep /> });

  return steps;
}

// ---------------------------------------------------------------------------
// Étape : Bienvenue
// ---------------------------------------------------------------------------

function WelcomeStep() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
        <Telescope size={36} />
      </div>
      <h1 className="text-2xl font-bold">Bienvenue sur DropScout</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Votre assistant de veille dropshipping. Trouvez des produits gagnants,
        comparez les prix sur AliExpress / CJ / eBay, et poussez-les vers vos boutiques.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 text-left">
        <Feature icon={Telescope} text="Chassez les produits gagnants par niche" />
        <Feature icon={Sparkles} text="Scorez chaque produit avec l'IA (0-100)" />
        <Feature icon={Store} text="Connectez Shopify / WooCommerce" />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2 text-sm dark:bg-slate-800/60">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-950/50">
        <Icon size={15} />
      </span>
      <span className="text-slate-700 dark:text-slate-200">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape : Clé Gemini (avec validation)
// ---------------------------------------------------------------------------

function KeyStep({ onValidated }: { onValidated: () => void }) {
  return (
    <div>
      <StepHeader icon={KeyRound} title="Connectez l'IA" />
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        DropScout utilise <strong>Gemini</strong> (gratuit) pour analyser les niches et
        scorer les produits. Récupérez une clé sur{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-brand-600 hover:underline dark:text-brand-400"
        >
          aistudio.google.com <ExternalLink size={11} />
        </a>{' '}
        puis collez-la ci-dessous.
      </p>
      <KeyForm onValidated={onValidated} />
    </div>
  );
}

function KeyForm({ onValidated }: { onValidated: () => void }) {
  const { toast } = useToast();
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [isValidated, setIsValidated] = useState(false);

  async function test() {
    // Nettoyage robuste : trim + retire espaces internes (copier-coller mobile).
    const clean = key.trim().replace(/\s+/g, '');
    if (!clean) {
      toast('Collez d\'abord votre clé.', 'warning');
      return;
    }
    setKey(clean); // reflète la clé nettoyée
    setTesting(true);
    const result = await testApiKey(clean, DEFAULT_MODEL);
    setTesting(false);
    if (result.ok) {
      await setSetting('geminiKey', clean);
      setApiKey(clean);
      setIsValidated(true);
      onValidated();
      toast('Clé valide ✓ — enregistrée', 'success');
    } else {
      setIsValidated(false);
      toast(`Échec : ${result.message}`, 'error');
    }
  }

  // Diagnostic temps réel de la clé saisie.
  const cleanKey = key.trim().replace(/\s+/g, '');
  const keyHint = cleanKey.length === 0
    ? null
    : !cleanKey.startsWith('AIza')
      ? { text: 'La clé devrait commencer par « AIza ».', cls: 'text-amber-600' }
      : cleanKey.length !== 39
        ? { text: `Longueur ${cleanKey.length}/39 — clé possiblement tronquée.`, cls: 'text-amber-600' }
        : { text: 'Format correct ✓', cls: 'text-green-600' };

  return (
    <div className="space-y-3">
      <Field label="Clé API Gemini" required hint="Collez la clé entière (commence par AIza, 39 caractères).">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            // Toute édition invalide le statut validé précédent.
            if (isValidated) setIsValidated(false);
          }}
          onBlur={() => setKey(key.trim().replace(/\s+/g, ''))}
          placeholder="AIza..."
          className="input"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      {keyHint && (
        <p className={`text-xs ${keyHint.cls} dark:${keyHint.cls}`}>{keyHint.text}</p>
      )}
      <button onClick={() => void test()} disabled={testing} className="btn-secondary w-full">
        {testing ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {testing ? 'Test en cours…' : isValidated ? 'Re-tester la clé' : 'Tester la clé'}
      </button>
      {isValidated && (
        <p className="text-xs font-medium text-green-600 dark:text-green-400">
          ✓ Clé validée — cliquez sur « Continuer » pour passer à l'étape suivante.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Stockée localement sur cet appareil. Jamais envoyée ailleurs.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape : Installer l'app (conseils ciblés par plateforme)
// ---------------------------------------------------------------------------

function InstallStep({ platform }: { platform: Platform }) {
  const guide = installGuide(platform);
  return (
    <div>
      <StepHeader icon={Download} title="Installez l'app" />
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Pour le rafraîchissement automatique en arrière-plan et les notifications,
        installez DropScout comme une app native.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <ol className="space-y-2.5 text-sm">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-950/50">
                {i + 1}
              </span>
              <span className="pt-0.5 text-slate-700 dark:text-slate-200">{s}</span>
            </li>
          ))}
        </ol>
      </div>
      {platform === 'ios' && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          ℹ️ Sur iOS, le rafraîchissement en arrière-plan n'est pas supporté. La veille
          s'actualisera à chaque ouverture de l'app.
        </p>
      )}
    </div>
  );
}

function installGuide(platform: Platform): { steps: string[] } {
  switch (platform) {
    case 'android':
      return {
        steps: [
          "Appuyez sur le menu (⋮) en haut à droite de Chrome.",
          "Sélectionnez « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
          "Confirmez. L'icône DropScout apparaît sur votre écran d'accueil.",
        ],
      };
    case 'ios':
      return {
        steps: [
          "Appuyez sur le bouton Partager (carré avec flèche) en bas de Safari.",
          "Sélectionnez « Sur l'écran d'accueil ».",
          "Confirmez. L'icône DropScout apparaît sur votre écran d'accueil.",
        ],
      };
    default:
      return {
        steps: [
          "Dans la barre d'adresse de Chrome/Edge, cliquez sur l'icône Installer (à droite).",
          "Ou menu (⋮) → « Installer l'application ».",
          "DropScout s'ouvre dans sa propre fenêtre, comme une app desktop.",
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// Étape : Proxy (optionnel)
// ---------------------------------------------------------------------------

function ProxyStep() {
  return (
    <div>
      <StepHeader icon={Store} title="Images produits & boutiques (optionnel)" />
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Pour afficher les <strong>vraies photos produits</strong> (AliExpress/CJ/eBay) et
        connecter vos boutiques Shopify/WooCommerce, un mini-proxy Cloudflare Worker
        est nécessaire.
      </p>
      <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
        <p className="mb-2 font-medium">C'est optionnel pour démarrer :</p>
        <ul className="space-y-1 text-slate-600 dark:text-slate-300">
          <li>✅ Sans proxy : veille texte + scores IA fonctionnels</li>
          <li>📸 Avec proxy : photos réelles + prix fournisseurs comparés</li>
          <li>🏪 Avec proxy : push produits vers vos boutiques</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Vous pourrez le configurer plus tard dans Réglages. Voir <code>proxy/README.md</code>.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape : Fin
// ---------------------------------------------------------------------------

function DoneStep() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500 text-white shadow-lg shadow-green-500/30">
        <Check size={40} />
      </div>
      <h1 className="text-2xl font-bold">Tout est prêt !</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Commencez par explorer une niche dans l'onglet <strong>Découvrir</strong>, ou
        demandez à l'agent de trouver des produits gagnants pour vous.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// En-tête d'étape réutilisable
// ---------------------------------------------------------------------------

function StepHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Icon size={20} />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}
