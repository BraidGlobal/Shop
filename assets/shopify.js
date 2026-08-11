/* =========================================================
   BRAID × SHOPIFY — live inventory via the Storefront API.
   Store: cjhrdr-mv.myshopify.com · Headless channel storefront
   The token below is the *public* Storefront API access token:
   client-safe by design (read-only product/inventory scopes).
   Each page exposes window.__braidCatalog = { products, onSync }
   and calls BraidShopify.autoSync() — prices, stock, and
   availability then hydrate from the live store.
   ========================================================= */
(function () {
  'use strict';

  const CONFIG = {
    domain: 'cjhrdr-mv.myshopify.com',
    token: 'a7a2ad9a03c917af603c32477c515c6d',
    apiVersion: '2026-07',
  };

  // Local catalog name -> Shopify product handle.
  // 'Charm Add-On' has no Shopify product yet, so it stays local-only.
  const HANDLE_MAP = {
    'Silk Scarf': 'edge-scarf-edge-scarf',
    'Charm Keychain': 'charm-keychain-charm-keychain',
    'Satin Scrunchie': 'satin-scrunchie',
    'Sticker Sheet': 'sticker-sheet',
    'B Mark': 'b-mark',
    'Star Boy': 'star-boy',
    'Star Girl': 'star-girl',
    'No Bad Hair Days': 'no-bad-hair-days',
    'Speak Up': 'speak-up',
  };

  const QUERY = `
    query BraidProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            handle
            title
            availableForSale
            totalInventory
            featuredImage { url }
            variants(first: 1) {
              edges {
                node {
                  id
                  availableForSale
                  quantityAvailable
                  price { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }`;

  async function fetchProducts() {
    const res = await fetch(`https://${CONFIG.domain}/api/${CONFIG.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': CONFIG.token,
      },
      body: JSON.stringify({ query: QUERY, variables: { first: 50 } }),
    });
    if (!res.ok) throw new Error(`Storefront API ${res.status}`);
    const json = await res.json();
    if (json.errors && !json.data) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data.products.edges.map(({ node }) => {
      const v = node.variants.edges[0] ? node.variants.edges[0].node : null;
      return {
        handle: node.handle,
        title: node.title,
        available: v ? v.availableForSale : node.availableForSale,
        stock: v && v.quantityAvailable != null ? v.quantityAvailable : node.totalInventory,
        price: v ? parseFloat(v.price.amount) : null,
        currency: v ? v.price.currencyCode : 'USD',
        image: node.featuredImage ? node.featuredImage.url : null,
        variantId: v ? v.id : null,
      };
    });
  }

  window.BraidShopify = {
    config: CONFIG,
    handleMap: HANDLE_MAP,
    fetchProducts,

    /* Hydrate a local products array in place. Returns the live list. */
    async sync(localProducts) {
      const live = await fetchProducts();
      const byHandle = Object.fromEntries(live.map((p) => [p.handle, p]));
      localProducts.forEach((lp) => {
        const sp = byHandle[HANDLE_MAP[lp.name]];
        if (!sp) return;
        if (sp.price != null) lp.price = sp.price;
        lp.available = sp.available;
        lp.stock = sp.stock;
        lp.variantId = sp.variantId;
      });
      return live;
    },

    /* Pages expose window.__braidCatalog = { products, onSync } */
    async autoSync() {
      const cat = window.__braidCatalog;
      if (!cat || !cat.products) return;
      try {
        await this.sync(cat.products);
        if (cat.onSync) cat.onSync();
      } catch (e) {
        console.warn('Braid × Shopify sync unavailable:', e.message || e);
      }
    },

    /* Real Shopify checkout via the Cart API — creates a cart in the store
       and returns its canonical checkoutUrl. items = [{variantId, qty}] */
    async createCheckout(items) {
      const lines = items
        .filter((it) => it.variantId && it.qty > 0)
        .map((it) => `{ merchandiseId: "${it.variantId}", quantity: ${it.qty} }`);
      if (!lines.length) return null;
      const mutation = `mutation { cartCreate(input: { lines: [${lines.join(',')}] }) { cart { checkoutUrl } userErrors { message } } }`;
      const res = await fetch(`https://${CONFIG.domain}/api/${CONFIG.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': CONFIG.token,
        },
        body: JSON.stringify({ query: mutation }),
      });
      const json = await res.json();
      const cart = json.data && json.data.cartCreate && json.data.cartCreate.cart;
      return cart ? cart.checkoutUrl : this.checkoutUrl(items); // permalink fallback
    },

    /* Legacy cart permalink (fallback): items = [{variantId, qty}] */
    checkoutUrl(items) {
      const parts = items
        .filter((it) => it.variantId && it.qty > 0)
        .map((it) => `${it.variantId.split('/').pop()}:${it.qty}`);
      if (!parts.length) return null;
      return `https://${CONFIG.domain}/cart/${parts.join(',')}`;
    },
  };
})();
