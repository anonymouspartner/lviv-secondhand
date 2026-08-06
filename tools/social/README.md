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

Output files are committed to the repo (they're served/referenced directly);
`node_modules/` is not.
