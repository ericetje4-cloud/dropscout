// ===========================================================================
// DropScout Proxy — Cloudflare Worker (gratuit, sans carte bancaire).
//
// Rôle : relayer les appels de l'app DropScout vers Shopify Admin API et
// WooCommerce REST, en contournant les restrictions CORS et en gardant les
// credentials transmis via headers (jamais dans le bundle navigateur).
//
// Sécurité : ce proxy est PUBLIC. Les credentials voyagent dans les headers
// X-Shop-* à chaque requête (depuis l'app de l'utilisateur). Pour un usage
// multi-utilisateurs, ajoutez une authentification (clé partagée, JWT...).
//
// Déploiement : voir proxy/README.md.
// ===========================================================================

// Clé partagée optionnelle. Définissez-la via `wrangler secret put PROXY_KEY`
// pour exiger un header X-Proxy-Key sur toutes les requêtes.
const PROXY_KEY = typeof PROXY_KEY_ENV !== 'undefined' ? PROXY_KEY_ENV : undefined;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Platform, X-Shop-Url, X-Shop-Token, X-Shop-Secret, X-Proxy-Key',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Authentification optionnelle par clé partagée.
    const expectedKey = env.PROXY_KEY ?? PROXY_KEY;
    if (expectedKey) {
      const sent = request.headers.get('X-Proxy-Key');
      if (sent !== expectedKey) {
        return json({ error: 'Non autorisé (clé proxy invalide).' }, 401);
      }
    }

    const url = new URL(request.url);

    // Health check simple.
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'dropscout-proxy' });
    }

    try {
      const platform = request.headers.get('X-Shop-Platform');
      if (platform === 'shopify') return handleShopify(request, url);
      if (platform === 'woocommerce') return handleWoo(request, url);
      return json({ error: `Plateforme non supportée : ${platform}` }, 400);
    } catch (e) {
      return json({ error: e.message || 'Erreur proxy' }, 502);
    }
  },
};

// ---------------------------------------------------------------------------
// Shopify Admin API (REST)
// ---------------------------------------------------------------------------

async function handleShopify(request, url) {
  const shopUrl = normalizeShopUrl(request.headers.get('X-Shop-Url'));
  const token = request.headers.get('X-Shop-Token');
  if (!shopUrl || !token) return json({ error: 'URL boutique et token requis.' }, 400);

  const apiBase = `https://${shopUrl}/admin/api/2024-10`;
  const auth = { Authorization: `Basic ${btoa(token)}`, 'Content-Type': 'application/json' };

  // GET /products  → liste
  if (url.pathname === '/products' && request.method === 'GET') {
    const r = await fetch(`${apiBase}/products.json?limit=50`, { headers: auth });
    return relay(r);
  }

  // POST /products → créer
  if (url.pathname === '/products' && request.method === 'POST') {
    const body = await request.text();
    const r = await fetch(`${apiBase}/products.json`, {
      method: 'POST',
      headers: auth,
      body,
    });
    return relay(r);
  }

  return json({ error: `Route Shopify inconnue : ${request.method} ${url.pathname}` }, 404);
}

// ---------------------------------------------------------------------------
// WooCommerce REST API
// ---------------------------------------------------------------------------

async function handleWoo(request, url) {
  const shopUrl = request.headers.get('X-Shop-Url');
  const key = request.headers.get('X-Shop-Token'); // consumer key
  const secret = request.headers.get('X-Shop-Secret'); // consumer secret
  if (!shopUrl || !key || !secret) {
    return json({ error: 'URL boutique, clé et secret requis.' }, 400);
  }

  const base = shopUrl.replace(/\/$/, '');
  const apiBase = `${base}/wp-json/wc/v3`;
  // Auth HTTP Basic (avant le hash OAuth) — WooCommerce l'accepte pour les clés API.
  const auth = 'Basic ' + btoa(`${key}:${secret}`);

  if (url.pathname === '/products' && request.method === 'GET') {
    const r = await fetch(`${apiBase}/products?per_page=50`, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
    });
    return relay(r);
  }

  if (url.pathname === '/products' && request.method === 'POST') {
    const body = await request.text();
    const r = await fetch(`${apiBase}/products`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body,
    });
    return relay(r);
  }

  return json({ error: `Route WooCommerce inconnue : ${request.method} ${url.pathname}` }, 404);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise l'URL d'une boutique Shopify (enlève https://, garde le domaine). */
function normalizeShopUrl(raw) {
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
}

/** Relaye une réponse distante en ajoutant les headers CORS. */
async function relay(resp) {
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json', ...CORS },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
