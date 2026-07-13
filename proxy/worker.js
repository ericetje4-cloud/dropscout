// ===========================================================================
// DropScout Proxy — Cloudflare Worker (gratuit, sans carte bancaire).
//
// Trois familles de routes :
//   - Shopify Admin API    (X-Shop-Platform: shopify)
//   - WooCommerce REST     (X-Shop-Platform: woocommerce)
//   - AliExpress Affiliate (paths /aliexpress/*) — signature MD5 IOP + proxy image
//
// Rôle : contourner CORS, garder les credentials côté serveur (jamais dans le
// bundle navigateur), et re-servir les images AliExpress protégées par hotlink.
//
// Sécurité : proxy PUBLIC par défaut. Pour un usage multi-utilisateurs, définir
// PROXY_KEY (wrangler secret) → toutes les requêtes doivent envoyer X-Proxy-Key.
// ===========================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Shop-Platform, X-Shop-Url, X-Shop-Token, X-Shop-Secret, X-Proxy-Key',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Authentification optionnelle par clé partagée.
    if (env.PROXY_KEY) {
      const sent = request.headers.get('X-Proxy-Key');
      if (sent !== env.PROXY_KEY) return json({ error: 'Non autorisé.' }, 401);
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const ali = !!(env.ALI_APP_KEY && env.ALI_APP_SECRET);
      return json({ ok: true, service: 'dropscout-proxy', aliexpress: ali });
    }

    try {
      // --- Routes AliExpress (dispatch par path) ---
      if (url.pathname.startsWith('/aliexpress/')) {
        return handleAliexpress(request, url, env);
      }

      // --- Routes boutiques (dispatch par header platform) ---
      const platform = request.headers.get('X-Shop-Platform');
      if (platform === 'shopify') return handleShopify(request, url);
      if (platform === 'woocommerce') return handleWoo(request, url);
      return json({ error: `Plateforme ou route inconnue : ${url.pathname}` }, 404);
    } catch (e) {
      return json({ error: e.message || 'Erreur proxy' }, 502);
    }
  },
};

// ===========================================================================
// AliExpress Affiliate API (IOP — signature MD5)
// ===========================================================================

async function handleAliexpress(request, url, env) {
  const appKey = env.ALI_APP_KEY;
  const appSecret = env.ALI_APP_SECRET;

  if (url.pathname === '/aliexpress/img') {
    return proxyAliImage(url, env);
  }

  if (url.pathname === '/aliexpress/search') {
    if (!appKey || !appSecret) {
      return json({ error: 'AliExpress non configuré côté proxy (ALI_APP_KEY / ALI_APP_SECRET manquants).' }, 503);
    }
    const keywords = url.searchParams.get('keywords');
    if (!keywords) return json({ error: 'Paramètre keywords requis.' }, 400);

    // Paramètres IOP (tri par clé pour la signature).
    const params = {
      app_key: appKey,
      method: 'aliexpress.affiliate.product.query',
      sign_method: 'md5',
      timestamp: Date.now().toString(),
      format: 'json',
      v: '2.0',
      // Paramètres métier (sérialisés en JSON dans la requête IOP).
      keywords,
      target_currency: 'EUR',
      target_language: 'FR',
      ship_to_country: 'FR',
      page_size: '10',
      sort: 'SALE_PRICE_ASC',
    };
    const sign = await iopSign(params, appSecret);

    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) body.append(k, v);
    body.append('sign', sign);

    const resp = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();

    // La structure de réponse IOP est imbriquée. On normalise.
    const raw = data?.aliexpress_affiliate_product_query_response
      ?.resp_result?.result?.products?.product ?? [];
    const products = raw.map((p) => ({
      title: p.product_title ?? '',
      imageUrl: p.product_image_url ?? '',
      price: p.app_sale_price ?? p.sale_price ?? '',
      currency: p.target_currency ?? p.app_sale_price_currency ?? 'EUR',
      productUrl: p.product_detail_url ?? '',
      productId: p.product_id ?? '',
    }));

    return json({ products });
  }

  return json({ error: `Route AliExpress inconnue : ${url.pathname}` }, 404);
}

/**
 * Proxy d'image AliExpress : fetch serveur (Referer omis) pour contourner le
 * hotlink protection du CDN Alibaba, puis re-sert l'image avec CORS.
 */
async function proxyAliImage(url, _env) {
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'Paramètre url requis.' }, 400);
  // Sécurité minimale : n'autoriser que les domaines CDN connus d'AliExpress.
  const allowed = ['alicdn.com', 'aliexpress-media.com', 'aliexpress.com'];
  let host = '';
  try {
    host = new URL(target).hostname;
  } catch {
    return json({ error: 'URL invalide.' }, 400);
  }
  if (!allowed.some((d) => host.includes(d))) {
    return json({ error: 'Domaine non autorisé.' }, 400);
  }

  const resp = await fetch(target, {
    headers: { Referer: '' }, // omis → contourne le referer ban
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!resp.ok) return json({ error: `Image injoignable (HTTP ${resp.status})` }, resp.status);

  const buf = await resp.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      ...CORS,
    },
  });
}

/**
 * Signature IOP standard AliExpress :
 *   sign = MD5(secret + (clé+valeurs triées concaténées) + secret).toUpperCase()
 * Cloudflare Workers supporte MD5 via crypto.subtle.digest (extension non-standard
 * mais officiellement supportée pour la compatibilité legacy).
 */
async function iopSign(params, secret) {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort()
    .map((k) => k + params[k])
    .join('');
  const data = new TextEncoder().encode(secret + sorted + secret);
  const digest = await crypto.subtle.digest('MD5', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// ===========================================================================
// Shopify Admin API (REST)
// ===========================================================================

async function handleShopify(request, url) {
  const shopUrl = normalizeShopUrl(request.headers.get('X-Shop-Url'));
  const token = request.headers.get('X-Shop-Token');
  if (!shopUrl || !token) return json({ error: 'URL boutique et token requis.' }, 400);

  const apiBase = `https://${shopUrl}/admin/api/2024-10`;
  const auth = { Authorization: `Basic ${btoa(token)}`, 'Content-Type': 'application/json' };

  if (url.pathname === '/products' && request.method === 'GET') {
    const r = await fetch(`${apiBase}/products.json?limit=50`, { headers: auth });
    return relay(r);
  }
  if (url.pathname === '/products' && request.method === 'POST') {
    const body = await request.text();
    const r = await fetch(`${apiBase}/products.json`, { method: 'POST', headers: auth, body });
    return relay(r);
  }
  return json({ error: `Route Shopify inconnue : ${request.method} ${url.pathname}` }, 404);
}

// ===========================================================================
// WooCommerce REST API
// ===========================================================================

async function handleWoo(request, url) {
  const shopUrl = request.headers.get('X-Shop-Url');
  const key = request.headers.get('X-Shop-Token');
  const secret = request.headers.get('X-Shop-Secret');
  if (!shopUrl || !key || !secret) return json({ error: 'URL boutique, clé et secret requis.' }, 400);

  const base = shopUrl.replace(/\/$/, '');
  const apiBase = `${base}/wp-json/wc/v3`;
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

// ===========================================================================
// Helpers
// ===========================================================================

function normalizeShopUrl(raw) {
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
}

async function relay(resp) {
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') ?? 'application/json',
      ...CORS,
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
