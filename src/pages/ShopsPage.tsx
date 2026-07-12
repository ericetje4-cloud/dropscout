// ===========================================================================
// Page Boutiques : gérer les connexions Shopify / WooCommerce (Pilier B).
// Ajout / test / suppression + push de produits de la watchlist.
// ===========================================================================

import { useEffect, useState } from 'react';
import {
  Store,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Upload,
  ExternalLink,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ConfirmDialog, EmptyState, Field, Modal, useToast } from '@/components/ui';
import {
  useStore,
  addShop,
  removeShop,
  updateShop,
  updateProduct,
} from '@/hooks/useStore';
import { pushShopProduct, testShopConnection } from '@/lib/shops-api';
import { getSetting } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import type { Product, Shop, ShopPlatform } from '@/types';

export function ShopsPage() {
  const { shops, products } = useStore();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pushFor, setPushFor] = useState<Shop | null>(null);

  async function onTest(shop: Shop) {
    setTestingId(shop.id);
    const r = await testShopConnection(shop);
    setTestingId(null);
    if (r.ok) {
      await updateShop(shop.id, { productCount: r.count });
      toast(`Connexion OK — ${r.count} produit(s) sur ${shop.label}.`, 'success');
    } else {
      toast(`Échec : ${r.message}`, 'error');
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await removeShop(toDelete);
    setToDelete(null);
    toast('Boutique supprimée.', 'success');
  }

  return (
    <Layout title="Boutiques" actions={
      <button onClick={() => setShowForm(true)} className="btn-primary px-3 py-1.5 text-xs">
        <Plus size={14} /> Ajouter
      </button>
    }>
      {shops.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🏪"
            title="Aucune boutique connectée"
            description="Connectez Shopify ou WooCommerce pour pousser vos produits gagnants."
            action={
              <button onClick={() => setShowForm(true)} className="btn-primary">
                <Plus size={15} /> Ajouter une boutique
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {shops.map((s) => (
            <ShopRow
              key={s.id}
              shop={s}
              testing={testingId === s.id}
              productCount={products.length}
              onTest={() => void onTest(s)}
              onPush={() => setPushFor(s)}
              onDelete={() => setToDelete(s.id)}
            />
          ))}
        </div>
      )}

      <ProxyHint />

      {showForm && (
        <ShopForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            toast('Boutique ajoutée ✓', 'success');
          }}
        />
      )}

      {pushFor && (
        <PushModal
          shop={pushFor}
          products={products}
          onClose={() => setPushFor(null)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette boutique ?"
        message="La connexion sera perdue. Vos produits sur l'app sont conservés."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </Layout>
  );
}

function ShopRow({
  shop,
  testing,
  onTest,
  onPush,
  onDelete,
}: {
  shop: Shop;
  testing: boolean;
  productCount: number;
  onTest: () => void;
  onPush: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                shop.platform === 'shopify'
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
              }`}
            >
              {shop.platform}
            </span>
            <p className="truncate font-medium">{shop.label}</p>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{shop.shopUrl}</p>
          {shop.productCount != null && (
            <p className="mt-1 text-xs text-slate-400">{shop.productCount} produit(s) distant(s)</p>
          )}
        </div>
        <Store size={22} className="shrink-0 text-slate-300" />
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={onTest} disabled={testing} className="btn-secondary flex-1 text-xs">
          {testing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          Tester
        </button>
        <button onClick={onPush} className="btn-secondary flex-1 text-xs">
          <Upload size={13} /> Pousser
        </button>
        <button
          onClick={onDelete}
          className="rounded-xl bg-red-50 p-2.5 text-red-600 hover:bg-red-100 dark:bg-red-950/30"
          aria-label="Supprimer"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulaire d'ajout de boutique
// ---------------------------------------------------------------------------

function ShopForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [platform, setPlatform] = useState<ShopPlatform>('shopify');
  const [shopUrl, setShopUrl] = useState('');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [markup, setMarkup] = useState('2.5');

  async function save() {
    if (!label.trim() || !shopUrl.trim() || !token.trim()) {
      toast('Libellé, URL et token requis.', 'warning');
      return;
    }
    await addShop({
      label: label.trim(),
      platform,
      shopUrl: shopUrl.trim(),
      token: token.trim(),
      secret: platform === 'woocommerce' ? secret.trim() || undefined : undefined,
      defaultMarkup: Number(markup) || 2.5,
    });
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle boutique"
      footer={
        <>
          <button className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
          <button className="btn-primary flex-1" onClick={() => void save()}>Enregistrer</button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nom (libre)" required>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ma boutique principale" className="input" />
        </Field>

        <Field label="Plateforme" required>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as ShopPlatform)} className="input">
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce (WordPress)</option>
          </select>
        </Field>

        <Field
          label="URL de la boutique"
          hint={platform === 'shopify' ? 'ex: ma-boutique.myshopify.com' : 'ex: https://ma-boutique.com'}
          required
        >
          <input value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} className="input" />
        </Field>

        {platform === 'shopify' ? (
          <Field
            label="Token Admin API"
            hint="Mot de passe (Admin API token) d'une Custom App créée dans Shopify Admin → Apps → Développement."
            required
          >
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="input" autoComplete="off" />
          </Field>
        ) : (
          <>
            <Field label="Clé consommateur (Consumer key)" required>
              <input value={token} onChange={(e) => setToken(e.target.value)} className="input" autoComplete="off" />
            </Field>
            <Field label="Secret consommateur (Consumer secret)" required>
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className="input" autoComplete="off" />
            </Field>
          </>
        )}

        <Field label="Markup par défaut" hint="Coefficient multiplicateur (ex: 2.5 = prix ×2,5 au push).">
          <input type="number" step="0.1" value={markup} onChange={(e) => setMarkup(e.target.value)} className="input" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal push produit
// ---------------------------------------------------------------------------

function PushModal({
  shop,
  products,
  onClose,
}: {
  shop: Shop;
  products: Product[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>('');
  const [markup, setMarkup] = useState(String(shop.defaultMarkup ?? 2.5));
  const [busy, setBusy] = useState(false);

  const pushable = products.filter((p) => p.costPrice != null);

  async function doPush() {
    const p = products.find((x) => x.id === selected);
    if (!p || p.costPrice == null) {
      toast('Choisis un produit avec un prix d\'achat.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const price = (p.costPrice * (Number(markup) || 2.5)).toFixed(2);
      await pushShopProduct(shop, {
        title: p.title,
        bodyHtml: p.notes ? `<p>${p.notes}</p>` : undefined,
        variants: [{ price, sku: undefined, inventoryQuantity: 0 }],
        images: p.image ? [{ src: p.image }] : undefined,
        tags: p.niche,
      });
      await updateProduct(p.id, { pushedToShopId: shop.id });
      toast(`Produit poussé sur ${shop.label} à ${formatMoney(Number(price))} ✓`, 'success');
      onClose();
    } catch (e) {
      toast(`Échec push : ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pousser vers ${shop.label}`}
      footer={
        <>
          <button className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
          <button className="btn-primary flex-1" onClick={() => void doPush()} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Pousser
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {pushable.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun produit avec un prix d'achat dans la watchlist.
          </p>
        ) : (
          <>
            <Field label="Produit">
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input">
                <option value="">— Choisir —</option>
                {pushable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({formatMoney(p.costPrice!)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Markup (coefficient)" hint="Prix de vente = prix d'achat × markup.">
              <input type="number" step="0.1" value={markup} onChange={(e) => setMarkup(e.target.value)} className="input" />
            </Field>
            {selected && (
              (() => {
                const p = products.find((x) => x.id === selected);
                if (!p?.costPrice) return null;
                const price = p.costPrice * (Number(markup) || 2.5);
                return (
                  <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950/30">
                    Prix de vente cible : <strong>{formatMoney(price)}</strong>
                  </p>
                );
              })()
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rappel configuration proxy
// ---------------------------------------------------------------------------

function ProxyHint() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    void getSetting('proxyUrl').then((u) => setConfigured(!!u));
  }, []);
  if (configured) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <p className="font-semibold">⚠️ Proxy requis</p>
      <p className="mt-1">
        La connexion aux boutiques nécessite le proxy Cloudflare Worker (gratuit).
        Déployez <code>proxy/worker.js</code> puis renseignez son URL dans les Réglages.
      </p>
      <p className="mt-1 flex items-center gap-1">
        Voir <code>proxy/README.md</code> <ExternalLink size={11} />
      </p>
    </div>
  );
}
