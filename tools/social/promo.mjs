// Instagram posts that advertise the app itself — what it is and why to use it —
// each ending on the website URL, since sending people to the site is the point.
// Run: `npm run promo` → marketing/instagram/*.jpg
//
// Four messages, one idea each, rather than one crowded post:
//   1 map    — the coverage claim (store count read live from stores.json)
//   2 cycle  — the differentiated idea: prices fall as stock is picked over
//   3 alerts — follow a store, hear about the restock
//   4 free   — no cost, no account, no tracking
//
// Every post is rendered at both Instagram sizes (square 1080×1080 and portrait
// 1080×1350) from the same markup, so the set stays consistent between formats.
//
// Ukrainian-dominant with a short English subline — the audience is shoppers in
// Lviv, and this matches the app's own uk_UA default and the existing assets.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CSS, C } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing/instagram');
mkdirSync(outDir, { recursive: true });

const SITE = process.env.PROMO_URL || 'www.lvivsecondhand.com';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

// Counted from the dataset rather than hardcoded, so the claim can't go stale
// the next time stores are added. Excludes the watermark, exactly as the app does.
const STORES = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'))
  .filter((s) => !s.watermark);
const N = STORES.length;
const N_KG = STORES.filter((s) => s.pricing === 'kg').length;
// A "мережа" means more than one branch — the same threshold /chain/ uses.
// Counting single-location brands here would overstate it.
const brandCounts = STORES.reduce((m, s) => {
  if (s.brand && s.brand !== 'Independent') m.set(s.brand, (m.get(s.brand) || 0) + 1);
  return m;
}, new Map());
const N_CHAINS = [...brandCounts.values()].filter((n) => n > 1).length;

// Ukrainian numerals take three forms; "131 магазинів" is correct but
// "132 магазини" is not interchangeable with it, so pick per value.
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

const SIZES = [
  { key: 'square', w: 1080, h: 1080 },
  { key: 'portrait', w: 1080, h: 1350 },
];

// Shared shell: deep-green ground, brand lockup top, message middle, URL bottom.
// The middle flexes, so the same markup composes at both aspect ratios without
// per-size tweaking.
const shell = ({ eyebrow, body, accentFoot }) => `
  <div class="card">
    <div class="top">
      <img src="data:image/png;base64,${iconB64}"/>
      <b class="display">Lviv Second Hand</b>
      ${eyebrow ? `<span class="eyebrow body">${eyebrow}</span>` : ''}
    </div>
    <div class="mid">${body}</div>
    <div class="foot ${accentFoot ? 'accent' : ''}">
      <span class="url display">${SITE}</span>
      <span class="cta body">${accentFoot || 'Відкрий карту — безкоштовно'}</span>
    </div>
  </div>`;

const POSTS = [
  {
    name: '1-map',
    accentFoot: 'Без реєстрації',
    body: `
      <div class="big display">${N}</div>
      <h1 class="display">${plural(N, 'секонд-хенд', 'секонд-хенди', 'секонд-хендів')}<br>Львова<br><em>на одній карті</em></h1>
      <p class="lede body">Адреси, години роботи, на вагу чи поштучно —
        і дні, коли завозять новий товар.</p>
      <p class="en body">Every secondhand store in Lviv, on one map.</p>`,
  },
  {
    name: '2-cycle',
    accentFoot: 'Колір = ціна',
    body: `
      <h1 class="display">Знай,<br><em>коли найдешевше</em></h1>
      <p class="lede body">У секонд-хенді ціни падають, поки товар розбирають.
        Карта показує, де кожен магазин у своєму циклі.</p>
      <div class="scale">
        <div class="step"><i style="background:#17693a"></i><b class="display">Щойно завезли</b><span class="body">найбільший вибір</span></div>
        <div class="step"><i style="background:#e0a11b"></i><b class="display">Середина</b><span class="body">баланс ціни й вибору</span></div>
        <div class="step"><i style="background:#c0392b"></i><b class="display">Кінець циклу</b><span class="body">найкращі ціни</span></div>
      </div>
      <p class="en body">Know exactly when each store is cheapest.</p>`,
  },
  {
    name: '3-alerts',
    accentFoot: 'Лише за згодою',
    body: `
      <div class="glyph">🔔</div>
      <h1 class="display">Дізнайся<br>про завезення<br><em>першим</em></h1>
      <p class="lede body">Стеж за магазином — і отримай сповіщення того ранку,
        коли він отримає новий товар.</p>
      <p class="en body">Follow a store, get told the morning it restocks.</p>`,
  },
  {
    name: '4-free',
    accentFoot: 'Працює навіть офлайн',
    body: `
      <h1 class="display">Безкоштовно.<br>Без реєстрації.<br><em>Без стеження.</em></h1>
      <ul class="checks body">
        <li>${N} ${plural(N, 'магазин', 'магазини', 'магазинів')} · ${N_CHAINS} ${plural(N_CHAINS, 'мережа', 'мережі', 'мереж')}</li>
        <li>Дні завозу — рахуємо за вас</li>
        <li>Години роботи та дні завезення</li>
        <li>Встановлюється як застосунок</li>
      </ul>
      <p class="en body">Free, no account, no tracking.</p>`,
  },
];

const css = (w, h) => {
  const s = h / 1080; // portrait gets a little more room; scale the rhythm with it
  return `
  ${CSS}
  body{width:${w}px;height:${h}px;background:${C.ink};}
  .card{width:${w}px;height:${h}px;background:
      radial-gradient(120% 90% at 12% 0%, ${C.green} 0%, ${C.ink} 62%);
    color:#fff;padding:${Math.round(64 * s)}px ${64}px;display:flex;flex-direction:column;}
  .top{display:flex;align-items:center;gap:16px;}
  .top img{width:64px;height:64px;border-radius:16px;}
  .top b{font-size:34px;letter-spacing:.02em;}
  .eyebrow{margin-left:auto;font-size:22px;color:#bfe6cf;}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(26 * s)}px;}
  /* h1.display, not h1: brand.mjs's .display sets line-height:.94, and a class
     outranks an element selector — a bare h1 rule here is silently ignored.
     Uppercase Cyrillic carries diacritics (Й, Ї) that the Latin-tuned .94
     leading clips into the line above, so these headlines need more room. */
  h1.display{font-size:${Math.round(96 * s)}px;line-height:1.15;letter-spacing:.004em;}
  h1 em{font-style:normal;color:${C.acid};}
  .big{font-size:${Math.round(210 * s)}px;line-height:.8;color:${C.acid};letter-spacing:-.02em;}
  .lede{font-size:${Math.round(31 * s)}px;line-height:1.42;color:#dff0e6;max-width:${Math.round(880)}px;}
  .en{font-size:${Math.round(24 * s)}px;color:#8fb9a1;letter-spacing:.01em;}
  .glyph{font-size:${Math.round(120 * s)}px;line-height:1;}
  /* Cycle scale: the post's whole argument, so it gets real weight */
  .scale{display:flex;flex-direction:column;gap:${Math.round(16 * s)}px;margin-top:${Math.round(6 * s)}px;}
  .step{display:flex;align-items:center;gap:20px;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:${Math.round(16 * s)}px 22px;}
  .step i{width:${Math.round(26 * s)}px;height:${Math.round(26 * s)}px;border-radius:50%;
          box-shadow:0 0 0 4px rgba(255,255,255,.14);flex:none;}
  .step b{font-size:${Math.round(30 * s)}px;letter-spacing:.02em;}
  .step span{font-size:${Math.round(23 * s)}px;color:#a9cdb8;margin-left:auto;}
  .checks{list-style:none;display:flex;flex-direction:column;gap:${Math.round(13 * s)}px;
          font-size:${Math.round(29 * s)}px;color:#dff0e6;}
  .checks li{display:flex;align-items:center;gap:14px;}
  .checks li:before{content:'';width:15px;height:15px;border-radius:4px;background:${C.acid};flex:none;}
  .foot{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
        border-top:1px solid rgba(255,255,255,.16);padding-top:${Math.round(26 * s)}px;}
  .url{font-size:${Math.round(42 * s)}px;color:${C.acid};letter-spacing:.01em;}
  .cta{font-size:${Math.round(24 * s)}px;color:#bfe6cf;text-align:right;}
`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let count = 0;
for (const post of POSTS) {
  for (const size of SIZES) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css(size.w, size.h)}</style></head>
<body>${shell(post)}</body></html>`;
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    // JPEG, not PNG: Meta's content-publishing API accepts JPEG only, and a
    // PNG image_url fails at container creation with an unhelpful generic
    // error. The card's background is an opaque gradient, so there is no alpha
    // to lose. q92 is visually lossless at these sizes and well under the 8 MB
    // cap. These images exist only to be posted, so there is no PNG copy.
    const buf = await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 });
    writeFileSync(resolve(outDir, `${post.name}-${size.key}.jpg`), buf);
    await page.close();
    count++;
  }
}
await browser.close();
console.log(`Wrote ${count} Instagram posts to marketing/instagram/ (${POSTS.length} messages × ${SIZES.length} sizes), ${N} stores.`);
