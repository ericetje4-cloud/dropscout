// ===========================================================================
// Types partagés de DropScout.
// Toutes les entités persistées dans IndexedDB sont définies ici.
// ===========================================================================

/** Identifiant unique (généré côté client). */
export type ID = string;

// ---------------------------------------------------------------------------
// FOURNISSEURS (sources d'appro / comparaison de prix)
// ---------------------------------------------------------------------------

/** Fournisseurs de produits supportés par la veille multi-sources. */
export type SupplierId = 'aliexpress' | 'cj' | 'ebay';

// ---------------------------------------------------------------------------
// PRODUITS (watchlist)
// ---------------------------------------------------------------------------

/** Statut d'un produit dans la watchlist. */
export type ProductStatus = 'idea' | 'testing' | 'winner' | 'dropped';
// 💡 Idée → 🧪 À tester → 🏆 Gagnant → ❌ Abandonné

/** Métadonnées du score produit (0–100). */
export interface ProductScore {
  /** Score global gagnant 0–100. */
  total: number;
  /** Sous-scores (0–100 chacun) pour expliquer le total. */
  margin: number;
  demand: number;
  competition: number;
  seasonality: number;
}

/** Un produit suivi dans la watchlist. */
export interface Product {
  id: ID;
  /** Titre / nom du produit. */
  title: string;
  /** URL source (AliExpress, Amazon, page fournisseur...). */
  url?: string;
  /** Image (data-URL ou URL distante). */
  image?: string;
  /** Niche de rattachement (libellé, ex. "gadget cuisine"). */
  niche?: string;
  /** Prix d'achat (coût fournisseur + shipping), dans la devise courante. */
  costPrice?: number;
  /** Prix de revente conseillé. */
  sellPrice?: number;
  /** Score gagnant (calculé ou IA). */
  score?: ProductScore;
  /** Marge brute calculée (sellPrice - costPrice). */
  margin?: number;
  /** Marge en % (margin / sellPrice). */
  marginPct?: number;
  /** Statut dans la watchlist. */
  status: ProductStatus;
  /** Notes libres. */
  notes?: string;
  /** Tags libres (ex. "saisonnier", "viral tiktok"). */
  tags?: string[];
  /** ID de la boutique où il a été poussé (undefined = non poussé). */
  pushedToShopId?: ID;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// NICHES (veille surveillée)
// ---------------------------------------------------------------------------

/** Une niche surveillée pour la veille. */
export interface Niche {
  id: ID;
  /** Mot-clé / libellé de la niche. */
  label: string;
  /** Région ciblée (ex. "FR", "US", "WW"). */
  region: string;
  /** Dernier résumé de veille produit par l'IA. */
  lastReport?: string;
  /** Sources de la dernière veille (URLs de citations). */
  lastSources?: string[];
  /** Date ISO du dernier rafraîchissement. */
  lastCheckedAt?: string;
  /** Nombre de produits sauvegardés issus de cette niche. */
  productCount?: number;
  /** Origine : 'user' (ajoutée manuellement) ou 'category' (surveillance auto). */
  origin?: 'user' | 'category';
  /** Clé de catégorie (présent si origin === 'category'). */
  categoryKey?: string;
  /** true si Gemini a détecté une tendance NOUVELLE/émergente au dernier check. */
  trendEmerging?: boolean;
  /** Explication de la tendance détectée (ex: "Lampe LED virale TikTok"). */
  trendReason?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// ANALYSES (historique des analyses IA)
// ---------------------------------------------------------------------------

/** Une analyse IA de produit (historisé pour comparer dans le temps). */
export interface Analysis {
  id: ID;
  /** Identifiant du produit analysé (si lié à la watchlist). */
  productId?: ID;
  /** Ce qui a été analysé (URL ou description libre). */
  input: string;
  /** Rapport complet renvoyé par l'IA. */
  report: string;
  /** Score attribué par l'IA. */
  score?: ProductScore;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// BOUTIQUES (connexion e-commerce)
// ---------------------------------------------------------------------------

/** Plateforme e-commerce supportée. */
export type ShopPlatform = 'shopify' | 'woocommerce';

/** Une boutique connectée (via le proxy). */
export interface Shop {
  id: ID;
  /** Nom arbitraire pour repérer la boutique. */
  label: string;
  platform: ShopPlatform;
  /** URL de la boutique (ex. "maboutique.myshopify.com" ou "https://shop.com"). */
  shopUrl: string;
  /**
   * Token d'API. Pour Shopify : mot de passe de l'app custom (Admin API token).
   * Pour WooCommerce : clé consommateur (la clé secrète est stockée dans secret).
   */
  token: string;
  /** Secret WooCommerce (clé secrète) — ignoré pour Shopify. */
  secret?: string;
  /** Markup par défaut appliqué au push de produits (ex. 2.5 = +150%). */
  defaultMarkup?: number;
  /** Nombre de produits synchronisés connus. */
  productCount?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// SETTINGS (key-value)
// ---------------------------------------------------------------------------

/** Clés du magasin key-value des paramètres. */
export type SettingKey =
  | 'theme' // 'light' | 'dark' | 'system'
  | 'currency' // 'EUR' | 'USD' | ...
  | 'geminiKey' // clé API Gemini
  | 'geminiModel' // identifiant du modèle Gemini
  | 'proxyUrl' // URL du proxy Cloudflare Worker (Pilier B)
  | 'defaultMarkup' // markup par défaut au push (ex. 2.5)
  | 'autoRefreshEnabled' // rafraîchissement auto de la veille
  | 'refreshIntervalHours' // intervalle en heures (6/12/24)
  | 'nichesSeenAt' // timestamp dernière visite des niches (badge nouveautés)
  | 'enabledSuppliers' // SupplierId[] activés pour la veille (défaut: tous)
  | 'hasCompletedOnboarding' // true après le premier parcours d'onboarding
  | 'categoryWatchEnabled'; // surveillance auto des catégories fixes (défaut: true)

export interface Setting<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue<K>;
  updatedAt: number;
}

export interface SettingValueMap {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  geminiKey: string;
  geminiModel: string;
  proxyUrl: string;
  defaultMarkup: number;
  autoRefreshEnabled: boolean;
  refreshIntervalHours: number;
  nichesSeenAt: number;
  enabledSuppliers: SupplierId[];
  hasCompletedOnboarding: boolean;
  categoryWatchEnabled: boolean;
}
export type SettingValue<K extends SettingKey> = SettingValueMap[K];

// ---------------------------------------------------------------------------
// SAUVEGARDE JSON (export / import)
// ---------------------------------------------------------------------------

/** Schéma complet exporté/importé pour la sauvegarde JSON. */
export interface BackupPayload {
  app: 'dropscout';
  version: number;
  exportedAt: string;
  products: Product[];
  niches: Niche[];
  analyses: Analysis[];
  shops: Shop[];
  settings: Setting[];
}

// ---------------------------------------------------------------------------
// AGENT CONVERSATIONNEL (boucle ReAct)
// ---------------------------------------------------------------------------

/** Nature d'une pièce jointe envoyée à l'agent. */
export type AttachmentKind = 'image' | 'text';

/** Une pièce jointe à un message. */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  /** Pour image → data-URL base64 ; pour text → texte extrait. */
  data: string;
  size: number;
  thumbnail?: string;
}

/** Rôle d'un message dans la conversation. */
export type ChatRole = 'user' | 'model';

/** Étape de raisonnement produite par la boucle ReAct. */
export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'answer';
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  text?: string;
}

/** Un message de la conversation avec l'agent. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  createdAt: number;
  attachments?: Attachment[];
  text?: string;
  steps?: AgentStep[];
  pending?: boolean;
  error?: string;
}
