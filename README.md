# DropScout — Assistant de veille & gestion dropshipping

Chasse les **produits gagnants** dans différentes niches, les **score**, garde une
**watchlist**, et se **connecte à tes boutiques** Shopify / WooCommerce pour y
pousser tes produits — façon AutoDS, mais auto-hébergé et sans abonnement.

![Stack](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![PWA](https://img.shields.io/badge/PWA-offline--first-a855f7)

---

## Fonctionnalités

### 🔭 Pilier A — Veille & analyse (fonctionne sans backend)
- **Veille de niche** : exploration des tendances réelles d'un marché via **Google Search grounding** (produits montants, saisons, sources citées).
- **Analyse & scoring** : colle une URL AliExpress/Amazon ou décris un produit → score gagnant 0–100 (marge, demande, concurrence, timing) + rapport + accroches publicitaires.
- **Saisie manuelle** : formulaire prix d'achat / revente → marge et score instantanés.
- **Watchlist** : produits suivis avec statuts (💡 Idée → 🧪 À tester → 🏆 Gagnant → ❌ Abandonné).
- **Agent conversationnel** : demande en langage naturel (« trouve 5 produits gagnants cuisine », « analyse cette URL », « montre ma watchlist »).

### 🏪 Pilier B — Connexion boutiques (nécessite le proxy)
- **Push de produits** vers Shopify / WooCommerce, avec markup configurable.
- **Test de connexion** et listing du catalogue distant.
- Proxy Cloudflare Worker gratuit (voir `proxy/README.md`).

---

## Stack technique

| Domaine | Choix |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styles | Tailwind CSS 3 |
| PWA | vite-plugin-pwa (Workbox) |
| Base de données | IndexedDB via `idb` |
| IA | Google Gemini (function calling + Google Search) |
| Icônes | lucide-react |
| Proxy boutiques | Cloudflare Worker |

---

## Lancer l'application

### Prérequis
- [Node.js](https://nodejs.org/) **20+**
- Une clé API Gemini gratuite ([ai.google.dev](https://ai.google.dev))

### Installation
```bash
cd dropscout
npm install
npm run dev
```

Puis ouvrir l'URL affichée (ex: `http://localhost:5173`).

### Clé Gemini
Au premier lancement, va dans **Réglages → Intelligence artificielle** et colle ta clé.
Le bouton **Tester** vérifie qu'elle fonctionne. Clé stockée localement sur l'appareil.

> ⚠️ En PWA statique, la clé est visible dans le code côté navigateur. N'utilise
> qu'une clé gratuite AI Studio à quota limité — jamais de clé payante.

---

## Connecter une boutique (Pilier B)

1. Déploie le proxy : `cd proxy && wrangler deploy` (voir `proxy/README.md`).
2. Renseigne l'URL du Worker dans **Réglages → Connexion boutiques**.
3. Ajoute ta boutique dans **Boutiques → Ajouter** (Shopify ou WooCommerce).

---

## Déploiement

### Build
```bash
npm run build      # génère dist/
npm run preview    # prévisualise le build
```

Le dossier `dist/` est statique : hébergeable sur GitHub Pages, Netlify,
Cloudflare Pages, Vercel, etc.

### GitHub Pages (automatique via Actions)

Le workflow `.github/workflows/deploy.yml` build et publie automatiquement sur
GitHub Pages à chaque push sur `main`. L'app est servie sous :
```
https://ericetje4-cloud.github.io/dropscout/
```

**Première activation** (une seule fois, après le premier push) :
1. Sur GitHub → **Settings du repo → Pages**
2. **Source : GitHub Actions** (pas *Deploy from a branch*)
3. Le workflow se déclenche au prochain push ; la page est prête en ~1 min.

Si tu déploies sous un **autre nom de repo**, adapte le `VITE_BASE_PATH` dans le
workflow (`.github/workflows/deploy.yml`) :
```yaml
env:
  VITE_BASE_PATH: /<ton-nom-de-repo>/
```

Build local avec le bon base path (pour tester comme en prod) :
```bash
VITE_BASE_PATH=/dropscout/ npm run build && npm run preview
```

---

## Structure du projet

```
src/
├── lib/
│   ├── gemini.ts         # Client Gemini (function calling + google_search)
│   ├── agent/            # Boucle ReAct + outils dropshipping
│   │   ├── index.ts      #   moteur (réutilisé de Mes Dépenses)
│   │   └── tools.ts      #   outils : research_niche, analyze_product...
│   ├── research.ts       # Veille niche + analyse produit (IA)
│   ├── scoring.ts        # Heuristique score gagnant 0-100
│   ├── shops-api.ts      # Client proxy boutiques
│   ├── db.ts             # Couche IndexedDB
│   └── format.ts         # Formatage localisé
├── pages/                # Dashboard, Discover, Watchlist, Shops, Agent, Settings
├── components/           # Layout, ProductCard, AgentTrace, ChatMessage, ui
├── hooks/                # useStore, useTheme, useNavigation
└── types/                # Modèle de données
proxy/
├── worker.js             # Cloudflare Worker (Shopify + WooCommerce)
├── wrangler.toml
└── README.md             # Guide de déploiement
```

---

## 🔔 Rafraîchissement automatique de la veille

Les niches surveillées (onglet **Découvrir → Surveillées**) s'actualisent automatiquement
grâce à 3 couches complémentaires :

| Couche | Quand | Couverture |
|---|---|---|
| **Catch-up à l'ouverture** | à chaque lancement de l'app | tous navigateurs |
| **Minuteur premier plan** | tant que l'app est ouverte | tous navigateurs |
| **Periodic Background Sync** | en arrière-plan, app fermée | Chrome/Edge + PWA installée |

Le **Réglages → Veille automatique** affiche le diagnostic réel de votre appareil
(PWA installée ? arrière-plan supporté ? notifications autorisées ?) pour savoir
exactement ce qui marchera.

**Pour activer l'arrière-plan** : installez l'app (icône sur l'écran d'accueil) sur
Chrome ou Edge, puis activez le toggle dans Réglages — les notifications préviennent
des nouveautés.

## Limitations connues

- **Arrière-plan limité à Chromium** : Safari et Firefox ne supportent pas
  Periodic Background Sync — la veille s'y actualise à l'ouverture + premier plan.
- **Quota Gemini** : la clé gratuite AI Studio a des limites (requêtes/min/jour).
- **Proxy mono-utilisateur** : ajoute `PROXY_KEY` pour un usage partagé.
