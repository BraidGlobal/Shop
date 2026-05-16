# Braid Shop — Mobile Prototype

An interactive 3-page mobile e-commerce prototype for **Braid** — hair care, curated. Built as standalone HTML/CSS/JS, no build step required.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Redirects to the shop landing. |
| `build-braid-flow-shop.html` | Landing — reels hero + product grid. |
| `build-braid-flow-detail.html` | Product detail — image carousel, variants, quantity, add to cart. |
| `build-braid-flow-cart.html` | Cart — itemized line items, quantity controls, subtotal, checkout. |

## Run locally

From this directory:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173/>.

> Note: opening the HTML files directly with `file://` will work for the visual layout, but `localStorage` and inter-page navigation (cart state shared across pages) only work when served over HTTP.

## State

The cart is persisted in `localStorage` under the key `braid_cart` as a map of `{ productIdx: quantity }`. To reset it during testing:

```js
localStorage.removeItem('braid_cart');
```

## Design tokens

- **Backgrounds:** Deep Indigo `#18172C`, Medium Purple `#302A4D`, Dark Purple `#221E3C`
- **Accents:** Soft Lilac `#E2C5FF`, Lavender `#C8BCF6`, Deep Violet `#5A199B`, Purple Border `#9F75C7`, Amber Orange `#FF9D33`
- **Type:** Sora (Gyst Variable fallback), Roboto, Inter
- **Radii / spacing:** 4 / 8 / 12 / 16 / 20 / 24 / 32 px

## Responsive support

- Desktop ≥ 461 px: renders inside a 380 × 820 device frame on a Deep Indigo backdrop.
- Mobile ≤ 460 px: full-screen, uses `100dvh` for dynamic viewport, `env(safe-area-inset-*)` for notch + home-indicator clearance, hides the fake iPhone chrome.
- Small phones ≤ 360 px: tightened spacing and font sizes.
- Landscape: hero and carousel proportions adapt.

`<meta name="theme-color" content="#18172C">` matches the browser address bar to the brand background; `apple-mobile-web-app-*` meta tags enable a clean "Add to Home Screen" experience on iOS.

## Assets

Product photography, hero lifestyle shots, and the Braid wordmark live in `assets/`. Replace any file with the same name to swap imagery without touching markup.
