# Social / marketing asset generators

Small Node scripts that render the project's shareable images. They use
Playwright (headless Chromium) to rasterize an HTML template, so the output
always matches the app's brand.

## Setup

```bash
cd tools/social
npm install
# On CI / this environment, Chromium is pre-installed — point Playwright at it:
#   export CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome
# Otherwise let Playwright fetch its own:
#   npx playwright install chromium
```

Each script takes an optional `CHROMIUM_PATH` env var; if unset, Playwright uses
its bundled browser.

## Generators

| Command | Output | What it is |
| --- | --- | --- |
| `npm run og` | `og-image.png` (repo root, 1200×630) | Open Graph / Twitter share-preview image referenced by `index.html`'s `og:image`. Re-run and commit if the branding changes. |
| `npm run poster` | `marketing/qr-poster.pdf` + `.png` (A4) | Printable bilingual QR poster for physical stores — the QR opens the app. Override the target with `POSTER_URL=…`. |
| `npm run deals` | `marketing/deals-this-week.jpg` + `deals-caption.txt` (1080×1080) | "Best by-weight deals right now" share image, ranked by the same `/cheap` logic as the bot, read straight from `index.html`. **JPEG** — Instagram's API accepts nothing else. The caption is written alongside it so the post describes that week's actual ranking. |
| `npm run sellsheet` | `marketing/sell-sheet.pdf` + `.png` (A4) | Bilingual one-page pitch for selling store owners on paid promotions (prices mirror `docs/ADVERTISING.md`). Override the contact with `SELLSHEET_CONTACT=…`. |
| `npm run flyer` | `marketing/flyer.pdf` + `.png` (A4 → 4× A6) | Bilingual shopper **handout flyer**, 4-up on one A4 to print and cut. The QR opens the app. |
| `npm run stickers` | `marketing/qr-stickers.pdf` + `.png` (A4 → 24) | Sheet of small **QR stickers** (4×6) for the agent to place in/around stores. Print on label paper and cut. |
| `npm run avatar` | `marketing/instagram/avatar-*.png` (1080×1080) + `avatar-preview.png` | **Instagram profile photo**, 3 variants, drawn from `favicon.svg`'s vector geometry rather than upscaling the app icon. Tuned for the circle crop: the hanger scales ~46%→60% of the width so it fills the circle instead of floating in a square with dead corners, and stroke weight rides the transform so it stays legible at 32px. `avatar-preview.png` shows each circle-cropped at 320/110/32px on light and dark feeds — the only view that settles the choice. |
| `npm run promo` | `marketing/instagram/*.jpg` (8 files) | **Instagram posts advertising the app itself** — 4 messages (coverage, the price-cycle idea, restock alerts, free/no-account) × 2 sizes (1080×1080 square, 1080×1350 portrait). Emitted as **JPEG**, not PNG — Instagram's publishing API accepts JPEG only. Every post ends on the site URL. Override with `PROMO_URL=…`. |

### Notes on the Instagram set

- Counts (`131 магазин`, `8 мереж`, `59 на вагу`) are **read from `stores.json` at
  render time**, so re-running after the data changes updates the claims rather
  than leaving a stale number in an image.
- Ukrainian numerals take three forms, so those counts go through a `plural()`
  helper — `131 магазин`, `59 магазинів`, `8 мереж` are each a different form.
- Headlines set `h1.display`, not `h1`: `brand.mjs`'s `.display` sets
  `line-height:.94`, and a class outranks a bare element selector, so an `h1`
  rule is silently ignored. Uppercase Cyrillic (Й, Ї) needs more leading than
  that Latin-tuned default or the diacritics clip into the line above.

Posting the Instagram set is manual by default; [`.github/workflows/instagram-post.yml`](../../.github/workflows/instagram-post.yml) can publish one via the Meta Graph API once the account is set up for it — see [`docs/INSTAGRAM.md`](../../docs/INSTAGRAM.md). It is `workflow_dispatch`-only and no-ops without the secrets, so it never fires on its own.

The deals image is also refreshed automatically every Monday by
[`.github/workflows/deals-image.yml`](../../.github/workflows/deals-image.yml),
which commits it so GitHub Pages serves an always-current copy at
`https://www.lvivsecondhand.com/marketing/deals-this-week.jpg` — and, when the ranking has actually moved, posts it to Instagram by calling `instagram-post.yml`.

Output files are committed to the repo (they're served/referenced directly);
`node_modules/` is not.
