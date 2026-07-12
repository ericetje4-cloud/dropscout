// ===========================================================================
// Formatage localisé (fr-FR) — montants, dates, périodes.
// Devise configurable (EUR par défaut). Aucune librairie externe (Intl natif).
// ===========================================================================

// Devise affichée. Peut être changée via setDisplayCurrency.
let displayCurrency = 'EUR';

/** Change la devise utilisée par formatMoney (ex. "USD"). */
export function setDisplayCurrency(code: string): void {
  if (code && code.length === 3) displayCurrency = code.toUpperCase();
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

const moneyFmtCache = new Map<string, Intl.NumberFormat>();
function moneyFmt(currency: string): Intl.NumberFormat {
  let f = moneyFmtCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
    moneyFmtCache.set(currency, f);
  }
  return f;
}
function moneyFmtCompact(currency: string): Intl.NumberFormat {
  const key = currency + '-compact';
  let f = moneyFmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    moneyFmtCache.set(key, f);
  }
  return f;
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const RELATIVE = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** Formate un montant dans la devise courante : 12.5 -> "12,50 €". */
export function formatMoney(amount: number, compact = false): string {
  if (!Number.isFinite(amount)) return '—';
  return compact
    ? moneyFmtCompact(displayCurrency).format(amount)
    : moneyFmt(displayCurrency).format(amount);
}

/** Alias conservé pour lisibilité (montants de produits). */
export const formatPrice = formatMoney;

/** Formate une date ISO (yyyy-mm-dd) en "09/07/2026". */
export function formatDate(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return DATE_FMT.format(d);
}

/** Formate une date ISO en version courte : "9 juil.". */
export function formatDateShort(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return DATE_SHORT.format(d);
}

/** "il y a 3 jours", "dans 2 mois"... */
export function formatRelative(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / 3_600_000);
    return RELATIVE.format(diffHours, 'hour');
  }
  if (Math.abs(diffDays) < 60) return RELATIVE.format(diffDays, 'day');
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return RELATIVE.format(diffMonths, 'month');
  return RELATIVE.format(Math.round(diffMonths / 12), 'year');
}

// ---------------------------------------------------------------------------
// Helpers de dates
// ---------------------------------------------------------------------------

/** Parse "yyyy-mm-dd" en Date locale (sans décalage UTC). */
export function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date du jour au format ISO (yyyy-mm-dd). */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Convertit une Date en ISO date-only (yyyy-mm-dd). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Formatage agent (conversation)
// ---------------------------------------------------------------------------

const TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Formate un horodatage (ms epoch) en "14:05". */
export function formatTime(ms: number): string {
  return TIME_FMT.format(new Date(ms));
}
