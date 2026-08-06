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
| `npm run deals` | `marketing/deals-this-week.png` (1080×1080) | "Best by-weight deals right now" share image, ranked by the same `/cheap` logic as the bot, read straight from `index.html`. |
| `npm run sellsheet` | `marketing/sell-sheet.pdf` + `.png` (A4) | Bilingual one-page pitch for selling store owners on paid promotions (prices mirror `docs/ADVERTISING.md`). Override the contact with `SELLSHEET_CONTACT=…`. |
| `npm run flyer` | `marketing/flyer.pdf` + `.png` (A4 → 4× A6) | Bilingual shopper **handout flyer**, 4-up on one A4 to print and cut. The QR opens the app. |
| `npm run stickers` | `marketing/qr-stickers.pdf` + `.png` (A4 → 24) | Sheet of small **QR stickers** (4×6) for the agent to place in/around stores. Print on label paper and cut. |

The deals image is also refreshed automatically every Monday by
[`.github/workflows/deals-image.yml`](../../.github/workflows/deals-image.yml),
which commits it so GitHub Pages serves an always-current copy at
`https://www.lvivsecondhand.com/marketing/deals-this-week.png`.

Output files are committed to the repo (they're served/referenced directly);
`node_modules/` is not.
