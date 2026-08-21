// Features one real store on Instagram — WITHOUT claiming it paid.
//
// This is the counterpart to ad-image.mjs, and the differences are the point:
//
//   * ad-image.mjs renders something a store BOUGHT. It must carry
//     "РЕКЛАМА · SPONSORED" and "Розміщення оплачене магазином", because the
//     app promises shoppers that paid placements are always labelled.
//   * This one renders something nobody bought. It carries the opposite
//     statement — "Не реклама" — so a reader never has to guess which kind of
//     post they are looking at.
//
// Saying nothing would have been the wrong default. Once some store posts are
// paid, an unlabelled post is ambiguous rather than neutral, and the ambiguity
// resolves in the direction that flatters us.
//
// There is NO free-text input. Every word on the card is either fixed chrome or
// a field of stores.json, so there is no field an advertiser could buy their way
// into and no sentence anyone can put in a shop's mouth. That is also why this
// file takes a store id and nothing else.
//
// The visual identity is inverted from the ad template — paper ground, green
// ink, no acid slab — so the two are never mistaken for each other at thumbnail
// size, where nobody reads the disclosure line at all.
//
// Inputs:
//   FEATURE_STORE_ID   required — must exist in stores.json
//   FEATURE_OUT        optional — output path (default marketing/instagram/features/<id>.jpg)
//
// Run: FEATURE_STORE_ID=s10 node store-feature.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { C, CSS } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const W = 1080, H = 1350;
const SITE = process.env.PROMO_URL || 'www.lvivsecondhand.com';

const storeId = (process.env.FEATURE_STORE_ID || '').trim();
if (!storeId) throw new Error('FEATURE_STORE_ID is required');

const stores = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'));
const store = stores.find((s) => s.id === storeId && !s.watermark);
// Fail loudly rather than featuring a shop that is not on the map: the address
// on the card has to be one a shopper can actually walk to.
if (!store) throw new Error(`store ${storeId} not found in stores.json`);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Ukrainian counts take three forms; 11–14 behave like "many" despite ending 1–4.
const plural = (n, one, few, many) => {
  const d = n % 10, h = n % 100;
  if (h >= 11 && h <= 14) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Нд' };
const DAY_EVERY = {
  mon: 'щопонеділка', tue: 'щовівторка', wed: 'щосереди', thu: 'щочетверга',
  fri: 'щоп’ятниці', sat: 'щосуботи', sun: 'щонеділі',
};

// The restock rhythm is the whole reason the map exists, so it leads — but only
// as far as the data actually supports. A store with a known weekly day gets the
// day; one with only a cycle gets the interval; one with neither gets no claim
// at all rather than a plausible-sounding guess.
function restockLine() {
  if (store.restockDay && DAY_EVERY[store.restockDay]) {
    return { big: `Новий завіз ${DAY_EVERY[store.restockDay]}`, has: true };
  }
  if (Number(store.cycle) >= 1) {
    const n = Math.round(Number(store.cycle));
    return { big: `Новий завіз кожні ${n} ${plural(n, 'день', 'дні', 'днів')}`, has: true };
  }
  return { big: 'Магазин на карті Львова', has: false };
}

// Seven rows of identical hours is noise. Collapse runs of equal values into
// ranges so the block reads at a glance: "Пн–Сб 10:00–19:00 · Нд зачинено".
function hoursGrouped() {
  const h = store.hours;
  if (!h || typeof h !== 'object') return [];
  const out = [];
  let i = 0;
  while (i < DAYS.length) {
    const v = h[DAYS[i]];
    if (v == null || v === '') { i++; continue; }
    let j = i;
    while (j + 1 < DAYS.length && h[DAYS[j + 1]] === v) j++;
    const label = i === j ? DAY_SHORT[DAYS[i]] : `${DAY_SHORT[DAYS[i]]}–${DAY_SHORT[DAYS[j]]}`;
    out.push({ label, value: v === 'closed' ? 'зачинено' : v });
    i = j + 1;
  }
  return out;
}

const rl = restockLine();
const hours = hoursGrouped();
const name = esc(store.name);
const address = esc(store.address || store.addressEn || '');
const phone = esc(store.phone || '');

// Longer headlines need smaller type; one line should never wrap to four.
const bigSize = rl.big.length <= 26 ? 128 : rl.big.length <= 34 ? 100 : 80;

const page_html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>
  ${CSS}
  html,body{width:${W}px;height:${H}px;overflow:hidden;}
  /* Paper ground, not the ad template's dark slab. The inversion is the
     disclosure, carried at a size a thumbnail still shows. */
  .card{width:${W}px;height:${H}px;display:flex;flex-direction:column;
    padding:64px;background:${C.paper};color:${C.ink};}
  .eyebrow{align-self:flex-start;border:2px solid ${C.green};color:${C.green};
    font-size:21px;letter-spacing:.15em;padding:10px 18px;border-radius:4px;}
  /* Two masses, not one centred block. Letting the whole lot centre left a
     dead band above the footer: the facts floated in the middle of the page
     with nothing under them. Centring the headline instead only moved the gap
     between the two. So headline, facts and footer form one bottom-anchored
     mass and all the slack collects at the top, held by the eyebrow — the
     content does not fill 1350px, and the only question is where the paper
     shows. Above the fold, deliberately, is better than a hole in the middle. */
  .hero{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:26px;
    padding:34px 0;}
  .facts{display:flex;flex-direction:column;gap:26px;padding-bottom:34px;}
  .big{font-size:${bigSize}px;line-height:1.06;color:${C.ink};}
  .rule{height:6px;width:120px;background:${C.acid};border-radius:3px;}
  .who .n{font-size:44px;line-height:1.15;margin-bottom:12px;color:${C.green};}
  .who .a{font-size:27px;color:${C.ink2};line-height:1.4;}
  .who .p{font-size:25px;color:${C.ink2};margin-top:10px;}
  .hours{display:flex;flex-direction:column;gap:9px;
    border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};padding:22px 0;}
  .hours .row{display:flex;justify-content:space-between;font-size:26px;color:${C.ink2};}
  .hours .row .d{letter-spacing:.06em;}
  .hours .row .v{font-variant-numeric:tabular-nums;}
  .foot{display:flex;flex-direction:column;gap:12px;}
  .foot .url{font-size:33px;letter-spacing:.02em;color:${C.green};}
  /* The negative disclosure. Small, but present in the reading path and in the
     caption both — an unlabelled post is ambiguous once other posts are paid. */
  .foot .dis{font-size:20px;color:${C.ink2};opacity:.8;}
</style></head><body>
  <div class="card">
    <div class="eyebrow display">Магазин на карті · On the map</div>
    <div class="hero">
      <div class="big display">${esc(rl.big)}</div>
      <div class="rule"></div>
    </div>
    <div class="facts">
      <div class="who">
        <div class="n display">${name}</div>
        <div class="a body">${address || 'Адресу дивіться на карті'}</div>
        ${phone ? `<div class="p body">☎ ${phone}</div>` : ''}
      </div>
      ${hours.length ? `<div class="hours">${hours.map((r) =>
        `<div class="row"><span class="d body">${esc(r.label)}</span><span class="v body">${esc(r.value)}</span></div>`
      ).join('')}</div>` : ''}
    </div>
    <div class="foot">
      <span class="url display">${SITE}</span>
      <span class="dis body">Не реклама. Магазин не платив за це розміщення.</span>
    </div>
  </div>
</body></html>`;

const out = process.env.FEATURE_OUT
  ? resolve(repoRoot, process.env.FEATURE_OUT)
  : resolve(repoRoot, `marketing/instagram/features/${storeId}.jpg`);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(page_html, { waitUntil: 'networkidle' });
// Overflow assertion, before the screenshot rather than after.
//
// The screenshot is of .card, so anything outside .card's border box is simply
// cropped away — silently, producing a plausible-looking image with a store's
// hours or half its name missing. A long name is the realistic trigger: the
// longest on the map is 49 characters.
//
// Ink is measured, not boxes. Oswald's uppercase Cyrillic carries diacritics
// (Й, Ї, Є) that ascend above the em box, so a line box can sit inside the card
// while the breve on Й does not. Every text box is therefore inflated by 0.2em
// before the comparison — a first attempt compared scrollHeight to clientHeight
// per element and flagged all 131 stores, including Latin-only names, because
// a font's natural line box routinely exceeds a tighter CSS line-height and
// paints outside it perfectly happily.
const overflow = await page.evaluate(() => {
  const card = document.querySelector('.card');
  const box = card.getBoundingClientRect();
  const bad = [];
  if (card.scrollHeight > card.clientHeight + 1) {
    bad.push(`content is ${card.scrollHeight - card.clientHeight}px taller than the card`);
  }
  if (card.scrollWidth > card.clientWidth + 1) {
    bad.push(`content is ${card.scrollWidth - card.clientWidth}px wider than the card`);
  }
  for (const el of document.querySelectorAll('.big, .who .n, .who .a, .who .p, .hours .row, .foot .url, .foot .dis, .eyebrow')) {
    const r = el.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).fontSize) * 0.2;
    const label = (el.textContent || '').trim().slice(0, 40);
    if (r.top - pad < box.top || r.bottom + pad > box.bottom) {
      bad.push(`"${label}" reaches the card's top/bottom edge`);
    }
    if (r.left < box.left - 1 || r.right > box.right + 1) {
      bad.push(`"${label}" reaches the card's left/right edge`);
    }
  }
  return bad;
});
if (overflow.length) {
  await browser.close();
  throw new Error(`layout does not fit for ${storeId}:\n  - ` + overflow.join('\n  - '));
}

// JPEG only — Instagram's publishing API rejects PNG.
writeFileSync(out, await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 }));
await browser.close();

// The caption is written here rather than by the workflow (as the ad pipeline
// does) because there is no buyer text to merge in — everything already comes
// from stores.json, which this file has open.
const hoursLine = hours.map((r) => `${r.label} ${r.value}`).join(' · ');
const caption = [
  rl.big,
  '',
  `📍 ${store.name}`,
  address ? store.address || store.addressEn : null,
  hoursLine || null,
  phone ? `☎ ${store.phone}` : null,
  '',
  `https://${SITE}/?store=${storeId}`,
  '',
  'Не реклама — магазин не платив за це розміщення. Дані з карти.',
  '',
  '#секондхендльвів #львів #секондхенд #lviv #шопінгльвів',
].filter((l) => l !== null).join('\n');

const capPath = out.replace(/\.jpg$/, '.txt');
writeFileSync(capPath, caption + '\n');

console.log(out.replace(repoRoot + '/', ''));
console.log(capPath.replace(repoRoot + '/', ''));
