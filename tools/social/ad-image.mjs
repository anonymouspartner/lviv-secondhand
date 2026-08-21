// Renders one paid store advertisement for Instagram.
//
// Unlike every other generator here, this one renders content a THIRD PARTY paid
// to publish, which changes the rules:
//
//   * It is labelled. "Платні розміщення завжди позначені" is a promise the app
//     makes to shoppers in its own disclosure copy, so РЕКЛАМА · SPONSORED is not
//     a styling choice and must not be removed to make an ad perform better.
//   * The store's own words are escaped and length-capped. The offer text arrives
//     from a Stripe Checkout custom field — buyer-supplied, never trusted.
//   * The facts around the offer (name, address, hours) come from stores.json,
//     not from the buyer, so an advertiser cannot invent an address.
//
// Inputs come from the environment so the workflow can pass them without
// shell-quoting a buyer's text into an argv:
//   AD_STORE_ID   required — must exist in stores.json
//   AD_TEXT       required — the offer line, max 120 chars (worker's DEAL_MAX)
//   AD_TIER       optional — label shown in the corner ('flash' | 'featured' | …)
//   AD_OUT        optional — output path (default marketing/instagram/ads/<id>.jpg)
//
// Run: AD_STORE_ID=c8 AD_TEXT='-30% сьогодні' node ad-image.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { C, CSS } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const W = 1080, H = 1350;
const TEXT_MAX = 120; // keep in step with DEAL_MAX in worker/worker.js
const SITE = process.env.PROMO_URL || 'www.lvivsecondhand.com';

const storeId = (process.env.AD_STORE_ID || '').trim();
const rawText = (process.env.AD_TEXT || '').trim();
const tier = (process.env.AD_TIER || '').trim();
if (!storeId) throw new Error('AD_STORE_ID is required');
if (!rawText) throw new Error('AD_TEXT is required');

const stores = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'));
const store = stores.find((s) => s.id === storeId && !s.watermark);
// Fail loudly rather than rendering an ad for a shop that is not on the map:
// the address on the card has to be one a shopper can actually walk to.
if (!store) throw new Error(`store ${storeId} not found in stores.json`);

// Buyer-supplied text goes through HTML escaping and a hard cap. It is placed
// as text content only — never as markup, never as a URL, never as CSS.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const offer = esc(rawText.slice(0, TEXT_MAX));
const name = esc(store.name);
const address = esc(store.address || store.addressEn || '');

// Longer offers need smaller type; one line should never wrap to four.
const offerSize = offer.length <= 28 ? 112 : offer.length <= 60 ? 84 : 62;

const TIER_LABEL = {
  flash: '⚡ Спалах-знижка · Flash deal',
  spotlight: 'Spotlight',
  featured: 'Featured',
  verified: 'Verified+',
};
const tierLine = TIER_LABEL[tier] || '';

const page_html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>
  ${CSS}
  html,body{width:${W}px;height:${H}px;overflow:hidden;}
  .card{width:${W}px;height:${H}px;display:flex;flex-direction:column;
    padding:64px;background:
      radial-gradient(120% 70% at 15% 0%, ${C.green} 0%, ${C.ink} 62%);color:#fff;}
  /* The disclosure sits at the top, in the reading path — not tucked in a
     corner where a scrolling reader would pass it. */
  .badge{align-self:flex-start;background:${C.paper};color:${C.ink};
    font-size:21px;letter-spacing:.15em;padding:11px 20px;border-radius:4px;}
  .tier{margin-top:14px;font-size:22px;color:${C.acid};letter-spacing:.05em;}
  /* Centred, with the offer block given a floor rather than allowed to grow:
     letting it flex to fill produced a huge empty slab around a short offer,
     and anchoring a content-sized block to the bottom left a dead field above.
     A min-height plus type that scales with the text length keeps the block
     substantial whether the offer is 15 characters or 120. */
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;
    padding:30px 0;}
  /* The offer is the advertiser's; the store identity beneath it is ours, taken
     from stores.json, so the two are visually separated. */
  .offer{min-height:300px;display:flex;align-items:center;
    background:${C.acid};color:${C.ink};padding:48px 44px;border-radius:8px;
    box-shadow:0 26px 60px rgba(0,0,0,.4);}
  .offer .t{font-size:${offerSize}px;line-height:1.08;}
  .who .n{font-size:46px;line-height:1.15;margin-bottom:12px;}
  .who .a{font-size:27px;color:#cfe6da;line-height:1.4;}
  .who .a.none{opacity:.62;font-style:italic;}
  .foot{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
    border-top:1px solid rgba(255,255,255,.18);padding-top:26px;}
  .foot .url{font-size:33px;letter-spacing:.02em;}
  .foot .cta{font-size:22px;opacity:.82;}
</style></head><body>
  <div class="card">
    <div>
      <div class="badge display">РЕКЛАМА · SPONSORED</div>
      ${tierLine ? `<div class="tier body">${tierLine}</div>` : ''}
    </div>
    <div class="mid">
      <div class="offer"><div class="t display">${offer}</div></div>
      <div class="who">
        <div class="n display">${name}</div>
        <div class="a body${address ? '' : ' none'}">${address || 'Адресу дивіться на карті'}</div>
      </div>
    </div>
    <div class="foot"><span class="url display">${SITE}</span>
      <span class="cta body">Магазин на карті</span></div>
  </div>
</body></html>`;

const out = process.env.AD_OUT
  ? resolve(repoRoot, process.env.AD_OUT)
  : resolve(repoRoot, `marketing/instagram/ads/${storeId}-${Date.now()}.jpg`);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(page_html, { waitUntil: 'networkidle' });
// JPEG only — Instagram's publishing API rejects PNG.
writeFileSync(out, await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 }));
await browser.close();

console.log(out.replace(repoRoot + '/', ''));
