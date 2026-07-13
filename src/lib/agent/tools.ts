// ===========================================================================
// Outils (tools) de l'agent DropScout : déclarations Gemini (function calling)
// + implémentations qui lisent/écrivent la base locale et appellent l'IA.
//
// Outils Pilier A (veille & analyse) :
//   - research_niche      : veille web d'une niche (Google Search grounding)
//   - analyze_product     : analyse IA d'un produit (score + rapport)
//   - save_product        : enregistre un produit dans la watchlist
//   - list_products       : liste la watchlist (filtrable par statut)
//   - update_product      : change le statut / prix d'un produit
//   - list_niches         : liste les niches surveillées
//   - add_niche           : ajoute une niche surveillée
// ===========================================================================

import type { GeminiFunctionDeclaration } from '@/lib/gemini';
import {
  addAnalysis,
  addNiche,
  addProduct,
  removeProduct,
  updateProduct,
} from '@/hooks/useStore';
import { getAllNiches, getAllProducts, getAllShops } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import { analyzeProduct, researchNiche } from '@/lib/research';
import { computeMargin, scoreProduct } from '@/lib/scoring';

// ---------------------------------------------------------------------------
// Types internes (identiques au pattern de l'app source)
// ---------------------------------------------------------------------------

export interface ToolContext {
  imageAttachments?: { data: string; name: string }[];
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

export interface ToolDef {
  declaration: GeminiFunctionDeclaration;
  handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  idea: '💡 Idée',
  testing: '🧪 À tester',
  winner: '🏆 Gagnant',
  dropped: '❌ Abandonné',
};

function isValidStatus(s: string): s is 'idea' | 'testing' | 'winner' | 'dropped' {
  return s in STATUS_LABELS;
}

// ---------------------------------------------------------------------------
// Outil : research_niche — veille web d'une niche (Google Search grounding)
// ---------------------------------------------------------------------------

const researchNicheTool: ToolDef = {
  declaration: {
    name: 'research_niche',
    description:
      "Lance une veille web temps réel sur une niche de marché (tendances, " +
      'produits montants, saisons) via Google Search. Renvoie un rapport ' +
      'synthétique + les sources. À utiliser quand l\'utilisateur veut ' +
      '"trouver des produits", "explorer une niche" ou "quoi vendre".',
    parameters: {
      type: 'object',
      properties: {
        niche: {
          type: 'string',
          description: 'La niche à explorer (ex. "gadget cuisine", "accessoires chiens", "fitness maison").',
        },
        region: {
          type: 'string',
          description: 'Code région / pays ciblé (ex. "FR", "US", "WW"). Défaut : "FR".',
        },
      },
      required: ['niche'],
    },
  },
  async handler(args) {
    const niche = String(args.niche ?? '').trim();
    if (!niche) return 'Erreur : niche manquante.';
    const region = String(args.region ?? 'FR').trim().toUpperCase();
    try {
      const { summary, trends, seasons, products, sources } = await researchNiche(niche, region);
      const lines: string[] = [`Veille « ${niche} » (${region}) :`, '', summary];
      if (trends.length > 0) lines.push('', 'Sous-tendances : ' + trends.join(', '));
      if (seasons) lines.push('', 'Saisons : ' + seasons);
      if (products.length > 0) {
        lines.push('', `${products.length} idée(s) de produits :`);
        products.forEach((p) => {
          lines.push(`- ${p.title}${p.estPrice ? ` (~${p.estPrice})` : ''} — ${p.marketingAngle}`);
        });
      }
      if (sources.length > 0) {
        lines.push('', 'Sources :', ...sources.slice(0, 6).map((s) => `- ${s}`));
      }
      return lines.join('\n');
    } catch (e) {
      return `Erreur lors de la veille : ${(e as Error).message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Outil : analyze_product — analyse IA d'un produit (score + rapport)
// ---------------------------------------------------------------------------

const analyzeProductTool: ToolDef = {
  declaration: {
    name: 'analyze_product',
    description:
      'Analyse un produit (à partir d\'une URL AliExpress/Amazon ou d\'une description) ' +
      'et renvoie un score gagnant 0-100 (demande, concurrence, saisonnalité, marge) ' +
      '+ un rapport + des idées d\'accroches publicitaires. Fournis cost_price et ' +
      'sell_price si tu les connais pour affiner le score de marge.',
    parameters: {
      type: 'object',
      properties: {
        product: {
          type: 'string',
          description: 'URL du produit OU description détaillée (titre, features, public cible).',
        },
        cost_price: {
          type: 'number',
          description: "Prix d'achat (coût fournisseur + livraison), dans la devise de l'utilisateur.",
        },
        sell_price: {
          type: 'number',
          description: "Prix de revente estimé.",
        },
        save: {
          type: 'boolean',
          description: 'Si true, enregistre automatiquement le produit analysé dans la watchlist avec son score.',
        },
      },
      required: ['product'],
    },
  },
  async handler(args) {
    const product = String(args.product ?? '').trim();
    if (!product) return 'Erreur : produit manquant.';
    const costPrice = args.cost_price != null ? Number(args.cost_price) : undefined;
    const sellPrice = args.sell_price != null ? Number(args.sell_price) : undefined;

    try {
      const analysis = await analyzeProduct({
        input: product,
        costPrice,
        sellPrice,
      });
      const score = scoreProduct({
        costPrice,
        sellPrice,
        demand: analysis.scores.demand,
        competition: analysis.scores.competition,
        seasonality: analysis.scores.seasonality,
      });

      // Historisation de l'analyse.
      await addAnalysis({
        input: product,
        report: analysis.report,
        score,
      });

      const hooks = analysis.adHooks.length > 0
        ? `\n\nAccroches pub :\n${analysis.adHooks.map((h) => `- ${h}`).join('\n')}`
        : '';

      let result =
        `Score gagnant : ${score.total}/100\n` +
        `  • Marge : ${score.margin} • Demande : ${score.demand} • Concurrence : ${score.competition} • Timing : ${score.seasonality}\n\n` +
        `${analysis.report}${hooks}`;

      if (costPrice != null && sellPrice != null) {
        const m = computeMargin(costPrice, sellPrice);
        if (m) {
          result += `\n\nMarge : ${formatMoney(m.margin)} (${Math.round(m.marginPct * 100)} %).`;
        }
      }

      // Sauvegarde optionnelle.
      if (args.save) {
        const titleMatch = product.match(/^https?:\/\//) ? product : product.slice(0, 60);
        const saved = await addProduct({
          title: titleMatch,
          url: product.startsWith('http') ? product : undefined,
          costPrice,
          sellPrice,
          score,
          margin: computeMargin(costPrice, sellPrice)?.margin,
          marginPct: computeMargin(costPrice, sellPrice)?.marginPct,
          status: 'idea',
        });
        result += `\n\n✅ Produit enregistré dans la watchlist (id ${saved.id}).`;
      }

      return result;
    } catch (e) {
      return `Erreur lors de l'analyse : ${(e as Error).message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Outil : save_product — enregistre un produit dans la watchlist
// ---------------------------------------------------------------------------

const saveProductTool: ToolDef = {
  declaration: {
    name: 'save_product',
    description:
      "Enregistre un nouveau produit dans la watchlist. Utilise cet outil " +
      "après une analyse ou quand l'utilisateur veut suivre un produit.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Nom/titre du produit.' },
        url: { type: 'string', description: 'URL source (AliExpress, Amazon, fournisseur).' },
        niche: { type: 'string', description: 'Niche de rattachement.' },
        cost_price: { type: 'number', description: "Prix d'achat." },
        sell_price: { type: 'number', description: 'Prix de revente.' },
        status: {
          type: 'string',
          description: 'Statut : "idea" (défaut), "testing", "winner", "dropped".',
        },
        notes: { type: 'string', description: 'Notes libres.' },
      },
      required: ['title'],
    },
  },
  async handler(args) {
    const title = String(args.title ?? '').trim();
    if (!title) return 'Erreur : titre manquant.';
    const costPrice = args.cost_price != null ? Number(args.cost_price) : undefined;
    const sellPrice = args.sell_price != null ? Number(args.sell_price) : undefined;
    const statusArg = String(args.status ?? 'idea');
    const status: 'idea' | 'testing' | 'winner' | 'dropped' = isValidStatus(statusArg) ? statusArg : 'idea';

    const m = computeMargin(costPrice, sellPrice);
    const p = await addProduct({
      title,
      url: args.url ? String(args.url) : undefined,
      niche: args.niche ? String(args.niche) : undefined,
      costPrice,
      sellPrice,
      margin: m?.margin,
      marginPct: m?.marginPct,
      status,
      notes: args.notes ? String(args.notes) : undefined,
    });
    return (
      `Produit enregistré : « ${title} » (${STATUS_LABELS[status]})` +
      (costPrice != null && sellPrice != null && m
        ? ` — marge ${formatMoney(m.margin)} (${Math.round(m.marginPct * 100)} %)`
        : '') +
      ` — id ${p.id}.`
    );
  },
};

// ---------------------------------------------------------------------------
// Outil : list_products — liste la watchlist
// ---------------------------------------------------------------------------

const listProductsTool: ToolDef = {
  declaration: {
    name: 'list_products',
    description:
      'Liste les produits de la watchlist. Filtre optionnel par statut ' +
      '("idea", "testing", "winner", "dropped").',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrer par statut.' },
        limit: { type: 'number', description: 'Nombre max (défaut 20).' },
      },
    },
  },
  async handler(args) {
    let products = await getAllProducts();
    if (args.status && isValidStatus(String(args.status))) {
      products = products.filter((p) => p.status === args.status);
    }
    const limit = args.limit ? Math.min(Number(args.limit), 100) : 20;
    if (products.length === 0) return 'Watchlist vide.';
    const lines = products.slice(0, limit).map((p) => {
      const score = p.score ? ` ${p.score.total}/100` : '';
      const margin = p.margin != null ? ` • ${formatMoney(p.margin)}` : '';
      return `- [${STATUS_LABELS[p.status]}] ${p.title}${score}${margin}${p.niche ? ` (${p.niche})` : ''} [id:${p.id}]`;
    });
    return `${products.length} produit(s) :\n${lines.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Outil : update_product — change statut / prix
// ---------------------------------------------------------------------------

const updateProductTool: ToolDef = {
  declaration: {
    name: 'update_product',
    description:
      "Modifie un produit de la watchlist (statut, prix, notes). Au moins " +
      "un champ à changer doit être fourni.",
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifiant du produit.' },
        status: { type: 'string', description: 'Nouveau statut.' },
        cost_price: { type: 'number' },
        sell_price: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  async handler(args) {
    const id = String(args.id ?? '');
    const patch: Record<string, unknown> = {};
    if (args.status && isValidStatus(String(args.status))) patch.status = args.status;
    if (args.cost_price != null) patch.costPrice = Number(args.cost_price);
    if (args.sell_price != null) patch.sellPrice = Number(args.sell_price);
    if (args.notes != null) patch.notes = String(args.notes);

    // Recalcule la marge si prix fournis.
    const all = await getAllProducts();
    const existing = all.find((p) => p.id === id);
    if (!existing) return `Erreur : produit ${id} introuvable.`;

    const cost = patch.costPrice != null ? Number(patch.costPrice) : existing.costPrice;
    const sell = patch.sellPrice != null ? Number(patch.sellPrice) : existing.sellPrice;
    const m = computeMargin(cost, sell);
    if (m) {
      patch.margin = m.margin;
      patch.marginPct = m.marginPct;
    }

    await updateProduct(id, patch);
    return `Produit mis à jour : « ${existing.title} ».`;
  },
};

// ---------------------------------------------------------------------------
// Outil : list_niches — liste les niches surveillées
// ---------------------------------------------------------------------------

const listNichesTool: ToolDef = {
  declaration: {
    name: 'list_niches',
    description: 'Liste les niches de marché surveillées.',
    parameters: { type: 'object', properties: {} },
  },
  async handler() {
    const niches = await getAllNiches();
    if (niches.length === 0) return 'Aucune niche surveillée.';
    const lines = niches.map(
      (n) => `- ${n.label} (${n.region})${n.lastCheckedAt ? ` — veille du ${n.lastCheckedAt}` : ''}`,
    );
    return `Niches surveillées :\n${lines.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Outil : add_niche — ajoute une niche surveillée
// ---------------------------------------------------------------------------

const addNicheTool: ToolDef = {
  declaration: {
    name: 'add_niche',
    description: "Ajoute une niche à la liste des niches surveillées.",
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Mot-clé de la niche.' },
        region: { type: 'string', description: 'Région ciblée (défaut "FR").' },
      },
      required: ['label'],
    },
  },
  async handler(args) {
    const label = String(args.label ?? '').trim();
    if (!label) return 'Erreur : libellé manquant.';
    const region = String(args.region ?? 'FR').trim().toUpperCase();
    const n = await addNiche({ label, region });
    return `Niche « ${label} » (${region}) ajoutée — id ${n.id}.`;
  },
};

// ---------------------------------------------------------------------------
// Outil : delete_product — supprime un produit
// ---------------------------------------------------------------------------

const deleteProductTool: ToolDef = {
  declaration: {
    name: 'delete_product',
    description: "Supprime un produit de la watchlist.",
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  async handler(args) {
    const id = String(args.id ?? '');
    await removeProduct(id);
    return `Produit ${id} supprimé.`;
  },
};

// ---------------------------------------------------------------------------
// Outil : list_shops — liste les boutiques connectées
// ---------------------------------------------------------------------------

const listShopsTool: ToolDef = {
  declaration: {
    name: 'list_shops',
    description: "Liste les boutiques e-commerce connectées (Shopify, WooCommerce).",
    parameters: { type: 'object', properties: {} },
  },
  async handler() {
    const shops = await getAllShops();
    if (shops.length === 0) {
      return 'Aucune boutique connectée. Ajoutez-en une dans Réglages → Boutiques (le proxy doit être configuré).';
    }
    const lines = shops.map(
      (s) => `- ${s.label} [${s.platform}] — ${s.shopUrl} [id:${s.id}]`,
    );
    return `Boutiques connectées :\n${lines.join('\n')}`;
  },
};

// ---------------------------------------------------------------------------
// Registre des outils
// ---------------------------------------------------------------------------

export const ALL_TOOLS: ToolDef[] = [
  researchNicheTool,
  analyzeProductTool,
  saveProductTool,
  listProductsTool,
  updateProductTool,
  deleteProductTool,
  listNichesTool,
  addNicheTool,
  listShopsTool,
];

export const TOOL_HANDLERS: Record<string, ToolHandler> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.declaration.name, t.handler]),
);

export const TOOL_DECLARATIONS = ALL_TOOLS.map((t) => t.declaration);
