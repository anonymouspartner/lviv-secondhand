// Renders one барахолка listing as a 1080×1350 Instagram card.
//
// WHY A RENDERED CARD RATHER THAN THE SELLER'S PHOTO
// Three reasons, and each one alone would be enough:
//
//   * Aspect ratio. Instagram's publishing API accepts 4:5 to 1.91:1 and
//     rejects anything else with a generic container error that names no
//     cause. A phone photo is routinely 9:16 — every second listing would
//     fail, opaquely. A fixed 1080×1350 frame makes that impossible.
//   * The facts. A photo alone says nothing about price, size or where to
//     collect it, and Instagram captions are not clickable — so whatever a
//     reader needs has to be *in the image*.
//   * Whose post this is. Item photos sit in a feed of map posts. The frame,
//     the disclosure line and the channel handle are what tell a reader they
//     are looking at somebody's jacket rather than at our data.
//
// The photo is never cropped to fit: it is contained inside the frame over a
// blurred copy of itself. Cropping a garment someone is trying to sell is the
// one failure mode that costs them the sale.
//
// NO FREE TEXT BEYOND THE WIZARD'S FIELDS. Everything on the card is either
// fixed chrome or a field of the listing row, and the row was validated by the
// metrics Worker before it ever became live. Same rule as store-feature.mjs.
//
// Inputs (env):
//   LISTING_JSON    required — the listing row, as JSON
//   LISTING_PHOTO   required — path to the seller's photo, already downloaded
//   LISTING_OUT     optional — output path (default marketing/instagram/market/<id>.jpg)
//
// Writes the .jpg and a .txt caption beside it, and prints both paths.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { C, CSS } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const W = 1080, H = 1350;
const PHOTO_H = 920;
const CHANNEL = 't.me/Lviv_Secondhand';

const raw = process.env.LISTING_JSON;
if (!raw) throw new Error('LISTING_JSON is required');
const L = JSON.parse(raw);
if (!L || typeof L.id !== 'string') throw new Error('LISTING_JSON has no id');

const photoPath = process.env.LISTING_PHOTO;
if (!photoPath) throw new Error('LISTING_PHOTO is required');

// The same seven categories the bot offers and the Worker validates. Unknown
// codes get no tag rather than an invented one.
const CATEGORIES = {
  women:       { label: 'Жіноче',    tag: '#жіноче' },
  men:         { label: 'Чоловіче',  tag: '#чоловіче' },
  shoes:       { label: 'Взуття',    tag: '#взуття' },
  kids:        { label: 'Дитяче',    tag: '#дитяче' },
  accessories: { label: 'Аксесуари', tag: '#аксесуари' },
  sport:       { label: 'Спорт',     tag: '#спорт' },
  other:       { label: 'Інше',      tag: '#інше' },
};
const cat = CATEGORIES[L.category] || null;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const title = String(L.title || '').trim();
const price = Number(L.price_uah);
if (!title || !Number.isFinite(price)) throw new Error(`listing ${L.id} has no title or price`);

// Optional fields vanish when absent rather than printing «не вказано» — the
// same rule the channel card follows.
const spec = [
  L.size ? `Розмір ${L.size}` : null,
  L.condition ? `Стан ${L.condition}` : null,
].filter(Boolean).join(' · ');

// A long title at a fixed size wraps into the disclosure line. Ramp it, and let
// the overflow assertion below catch anything the ramp does not.
const titleSize = title.length <= 22 ? 62 : title.length <= 38 ? 50 : 42;

const photo = 'data:image/jpeg;base64,' + readFileSync(resolve(process.cwd(), photoPath)).toString('base64');

const page_html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>
  ${CSS}
  html,body{width:${W}px;height:${H}px;overflow:hidden;}
  .card{width:${W}px;height:${H}px;display:flex;flex-direction:column;
    background:${C.paper};color:${C.ink};}
  /* The photo, whole. .fill is the same image blown up and blurred behind it,
     so a portrait photo fills 1080px of width without a garment losing its
     sleeves to a centre crop. */
  .photo{position:relative;width:${W}px;height:${PHOTO_H}px;overflow:hidden;background:${C.ink};}
  .photo .fill{position:absolute;inset:-60px;background-image:url('${photo}');
    background-size:cover;background-position:center;filter:blur(38px) brightness(.55);}
  .photo img{position:relative;width:100%;height:100%;object-fit:contain;}
  /* Price as a slab on the photo: the one number a scroller stops for. */
  .price{position:absolute;left:0;bottom:34px;background:${C.acid};color:${C.ink};
    font-size:56px;padding:14px 30px 14px 40px;border-radius:0 6px 6px 0;}
  .tag{position:absolute;right:34px;top:34px;background:rgba(13,44,26,.82);color:${C.paper};
    font-size:22px;letter-spacing:.12em;padding:10px 18px;border-radius:4px;}
  .info{flex:1;display:flex;flex-direction:column;padding:38px 56px 34px;gap:14px;}
  .t{font-size:${titleSize}px;line-height:1.08;color:${C.ink};}
  .s{font-size:27px;color:${C.ink2};}
  .a{font-size:27px;color:${C.ink2};}
  .who{margin-top:auto;font-size:31px;color:${C.green};}
  .foot{display:flex;justify-content:space-between;align-items:baseline;gap:20px;
    border-top:1px solid ${C.line};padding-top:18px;}
  .foot .url{font-size:29px;letter-spacing:.02em;color:${C.green};}
  /* Listings share a feed with the map's own posts and with paid store ads.
     An unlabelled post is ambiguous rather than neutral, so it is labelled. */
  .foot .dis{font-size:19px;color:${C.ink2};opacity:.85;text-align:right;}
</style></head><body>
  <div class="card">
    <div class="photo">
      <div class="fill"></div>
      <img src="${photo}" alt="">
      ${cat ? `<div class="tag display">${esc(cat.label)}</div>` : ''}
      <div class="price display">${Math.round(price)} ₴</div>
    </div>
    <div class="info">
      <div class="t display">${esc(title)}</div>
      ${spec ? `<div class="s body">${esc(spec)}</div>` : ''}
      ${L.area ? `<div class="a body">📍 ${esc(L.area)}</div>` : ''}
      <div class="who body">Пишіть @${esc(L.seller_username)} у Telegram</div>
      <div class="foot">
        <span class="url display">${CHANNEL}</span>
        <span class="dis body">Оголошення користувача.<br>Ми не беремо участі в угоді.</span>
      </div>
    </div>
  </div>
</body></html>`;

const out = process.env.LISTING_OUT
  ? resolve(repoRoot, process.env.LISTING_OUT)
  : resolve(repoRoot, `marketing/instagram/market/${L.id}.jpg`);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(page_html, { waitUntil: 'networkidle' });

// Same assertion store-feature.mjs makes, and for the same reason: the
// screenshot crops silently, so a title one line too long would produce a
// plausible card with the disclosure line missing. Text boxes are inflated by
// 0.2em first — Oswald's Cyrillic diacritics (Й, Ї, Є) paint above the em box.
const overflow = await page.evaluate(() => {
  const info = document.querySelector('.info');
  const box = info.getBoundingClientRect();
  const bad = [];
  if (info.scrollHeight > info.clientHeight + 1) {
    bad.push(`the text block is ${info.scrollHeight - info.clientHeight}px taller than the space under the photo`);
  }
  for (const el of document.querySelectorAll('.info .t, .info .s, .info .a, .info .who, .foot .url, .foot .dis')) {
    const r = el.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).fontSize) * 0.2;
    const label = (el.textContent || '').trim().slice(0, 40);
    if (r.top - pad < box.top || r.bottom + pad > box.bottom) bad.push(`"${label}" reaches the edge of the text block`);
    if (r.left < box.left - 1 || r.right > box.right + 1) bad.push(`"${label}" reaches the left/right edge`);
  }
  return bad;
});
if (overflow.length) {
  await browser.close();
  throw new Error(`layout does not fit for listing ${L.id}:\n  - ` + overflow.join('\n  - '));
}

// JPEG only — Instagram's publishing API rejects PNG.
writeFileSync(out, await page.locator('.card').screenshot({ type: 'jpeg', quality: 90 }));
await browser.close();

// Instagram captions are not clickable, so the caption's job is to say where
// the market is in text a reader can retype, and to carry the same disclosure
// the card does — a caption is what gets read when the image is scrolled past.
const caption = [
  title,
  `${Math.round(price)} ₴`,
  spec || null,
  L.area ? `📍 ${L.area}` : null,
  '',
  `Пишіть @${L.seller_username} у Telegram.`,
  '',
  `Уся барахолка — ${CHANNEL}`,
  'Оголошення користувача · ми не беремо участі в угоді й не гарантуємо її.',
  '',
  ['#барахолка', '#секондхендльвів', '#львів', cat ? cat.tag : null, '#lviv', '#thrifted', '#вінтаж']
    .filter(Boolean).join(' '),
].filter((l) => l !== null).join('\n');

const capPath = out.replace(/\.jpg$/, '.txt');
writeFileSync(capPath, caption + '\n');

console.log(out.replace(repoRoot + '/', ''));
console.log(capPath.replace(repoRoot + '/', ''));
