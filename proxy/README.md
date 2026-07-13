# DropScout Proxy — Cloudflare Worker

Relais entre l'app DropScout et : vos boutiques **Shopify** / **WooCommerce**,
et l'**API AliExpress Affiliate** (pour les images produits réelles).
Gratuit, sans carte bancaire. Il contourne les restrictions CORS du navigateur,
garde vos credentials hors du bundle de l'app, et re-sert les images AliExpress
protégées par hotlink.

## Pourquoi un proxy ?

- **Shopify / WooCommerce** : leurs API n'envoient pas les en-têtes CORS
  nécessaires aux appels navigateur, et exposer vos tokens d'Admin dans une PWA
  statique serait une faille.
- **AliExpress** : l'API Affiliate exige une signature MD5 avec un `app_secret`
  (jamais côté navigateur) et n'envoie pas de CORS. Ses images CDN sont protégées
  par hotlink (Referer). Le Worker signe, appelle, et re-sert les images.

## Prérequis

- Un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (gratuit).
- `npm install -g wrangler` puis `wrangler login`.

## Déploiement (5 min)

```bash
cd proxy
wrangler deploy
```

Vous obtiendrez une URL du type :
`https://dropscout-proxy.votre-sous-domaine.workers.dev`

Copiez cette URL et collez-la dans **DropScout → Réglages → Connexion boutiques**.

## Vérification

Ouvrez l'URL du proxy dans votre navigateur :
```json
{ "ok": true, "service": "dropscout-proxy" }
```

## Obtenir vos credentials

### Shopify
1. Shopify Admin → **Apps** → **App development** → **Create custom app**.
2. Donnez un nom, puis dans **Configure Admin API scopes** activez :
   - `read_products`, `write_products`.
3. **Install app** → copiez le **Admin API token** (mot de passe).

Dans DropScout → Boutiques → Ajouter :
- Plateforme : **Shopify**
- URL : `ma-boutique.myshopify.com`
- Token : le Admin API token.

### WooCommerce
1. WordPress Admin → **WooCommerce → Settings → Advanced → REST API** → **Add key**.
2. Permissions : **Read/Write**, description libre.
3. Copiez **Consumer key** et **Consumer secret**.

Dans DropScout → Boutiques → Ajouter :
- Plateforme : **WooCommerce**
- URL : `https://ma-boutique.com`
- Token : Consumer key (`ck_...`)
- Secret : Consumer secret (`cs_...`)

## AliExpress (images produits réelles)

Pour afficher les vraies photos produits AliExpress + prix + liens d'achat dans
la veille de niche. **Optionnel** : sans AliExpress, la veille fonctionne en
mode texte (aucune régression).

### Obtenir les credentials
1. Créez un compte sur les **Portails AliExpress** : [portals.aliexpress.com](https://portals.aliexpress.com) (gratuit).
2. **Outils → API → demander l'accès** (validation ~24-48 h, parfois immédiat).
3. Récupérez votre **App Key** et **App Secret**.

### Configurer le Worker
```bash
wrangler secret put ALI_APP_KEY     # collez votre App Key
wrangler secret put ALI_APP_SECRET  # collez votre App Secret
wrangler deploy
```

Vérifiez qu'AliExpress est actif :
```bash
curl https://dropscout-proxy.<votre-sous-domaine>.workers.dev/health
# → { "ok": true, "service": "dropscout-proxy", "aliexpress": true }
```

Côté app, rien à configurer : si `aliexpress: true` dans `/health`, les images
produits apparaissent automatiquement dans la veille.

## Sécurité

Ce proxy est public par défaut. Les credentials transitent dans les en-têtes
`X-Shop-*` (depuis votre navigateur vers le proxy, puis retirés avant le relais).
C'est adapté à un usage **personnel mono-utilisateur**.

Pour un usage partagé, ajoutez une clé d'accès :
```bash
wrangler secret put PROXY_KEY
```
Toutes les requêtes devront alors inclure l'en-tête `X-Proxy-Key`.

## Endpoints

| Méthode | Route        | Rôle                        |
|---------|--------------|-----------------------------|
| GET     | `/health`    | Vérifie que le proxy tourne |
| GET     | `/products`  | Liste les produits          |
| POST    | `/products`  | Crée un produit             |

L'app DropScout utilise automatiquement ces routes selon la plateforme indiquée.
