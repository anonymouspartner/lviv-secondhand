// Four Instagram posts that argue for the app from a point of view, rather than
// listing what it does. promo.mjs already covers the feature pitch; these are
// the stories underneath it — one per audience:
//
//   1-shopper  — the price cycle, told as a falling tag (no currency: see below)
//   2-owner    — the map at night, told as visibility on the day you have stock
//   3-job      — the field-scout role, told as the survey card the job produces
//   4-flash    — running a flash deal, told as the countdown the shopper sees
//
// Each gets its own visual world on purpose. A single template recoloured four
// ways reads as one advertiser talking four times; four treatments read as four
// reasons. What holds them together is the palette, Oswald, and the fact that
// every one ends on the same URL.
//
// Portrait only (1080×1350). It is the largest slot Instagram gives a feed post,
// and each of these is built around one full-height idea — a receipt, a map, a
// card, a countdown — that a square crop would cut the legs off.
//
// Prices are read from the app and the Worker, not retyped: see PRICES below.
// Run: `npm run stories` → marketing/instagram/story-*.jpg
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { C, CSS } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing/instagram');
mkdirSync(outDir, { recursive: true });

const SITE = process.env.PROMO_URL || 'www.lvivsecondhand.com';
const W = 1080, H = 1350;

// ── Facts, read rather than remembered ───────────────────────────────────────
const stores = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'))
  .filter((s) => !s.watermark);
const N = stores.length;

// Flash-deal prices live in worker/worker.js as kopiyky; the tier sheet in
// index.html holds the monthly ones. Parsing beats retyping — a price that
// drifts out of sync with checkout is worse than no price at all.
const workerSrc = readFileSync(resolve(repoRoot, 'worker/worker.js'), 'utf8');
const flashAmount = (key) => {
  const m = new RegExp(`'${key}':\\s*\\{\\s*amount:\\s*(\\d+)`).exec(workerSrc);
  if (!m) throw new Error(`flash tier ${key} not found in worker.js — check FLASH_DEAL_TIERS`);
  return Number(m[1]) / 100;
};
const appSrc = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
const planMonthly = (tier) => {
  const m = new RegExp(`tier:'${tier}',\\s*monthly:(\\d+)`).exec(appSrc);
  if (!m) throw new Error(`plan ${tier} not found in index.html — check PROMO_PLANS`);
  return Number(m[1]);
};
const PRICES = {
  flash3h: flashAmount('3h'),
  flash24h: flashAmount('24h'),
  flash24hAlert: flashAmount('24h_alert'),
  verified: planMonthly('verified'),
  featured: planMonthly('featured'),
};

const uah = (n) => '₴' + n.toLocaleString('uk-UA');

// Ukrainian counts take three forms; 11–14 behave like "many" despite ending 1–4.
const plural = (n, one, few, many) => {
  const d = n % 10, h = n % 100;
  if (h >= 11 && h <= 14) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};

// ── Shared chrome ────────────────────────────────────────────────────────────
// Oswald's .display sets line-height .94, tuned for Latin. Uppercase Cyrillic
// carries diacritics (Й, Ї, Є) that clip into the line above at that leading,
// and a class beats a bare element selector — so this must be h1.display, not h1.
const BASE = `
  ${CSS}
  html,body{width:${W}px;height:${H}px;overflow:hidden;}
  .card{width:${W}px;height:${H}px;display:flex;flex-direction:column;position:relative;overflow:hidden;}
  h1.display{line-height:1.1;letter-spacing:.004em;}
  .foot{display:flex;align-items:baseline;justify-content:space-between;gap:20px;}
  .foot .url{font-size:34px;letter-spacing:.02em;}
  .foot .cta{font-size:23px;opacity:.8;}
`;

const page_html = (css, body) =>
  `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>${body}</body></html>`;

// ── 1. Shopper — the falling tag ────────────────────────────────────────────
// One rail, one jacket, seven days: the garment does not change, the tag does.
//
// Deliberately NO currency. Per-kilogram rates differ store to store and move
// with the exchange rate, so any number printed into a JPEG is wrong somewhere
// the day it posts — and this account would be the one that published it. The
// shape of the cycle is the true part, and it is the part that sells the app.
// The three phase labels are the app's own (freshLabel/midLabel/oldLabel), so
// the post teaches the exact vocabulary the map uses.
const shopper = {
  name: '1-shopper',
  css: `
    body{background:${C.ink};}
    .card{padding:72px 64px;background:
      radial-gradient(120% 80% at 80% 0%, ${C.green} 0%, ${C.ink} 58%);color:#fff;}
    .kicker{font-size:24px;letter-spacing:.16em;color:${C.acid};margin-bottom:20px;}
    h1{font-size:82px;}
    h1 em{font-style:normal;color:${C.acid};}
    .sub{font-size:27px;line-height:1.45;color:#cfe6da;max-width:28ch;margin:22px 0 42px;}
    .strip{flex:1;display:flex;flex-direction:column;gap:10px;}
    .day{flex:1;display:flex;align-items:center;gap:20px;}
    .day .n{flex:none;width:118px;font-size:23px;letter-spacing:.05em;color:#9dbdaa;}
    /* The label column is always reserved, even when empty. Without it the
       bar's width% resolved against whatever space the label left over, so a
       labelled row drew shorter than the unlabelled row beneath it — the bars
       stopped descending, which was the entire point of the graphic. */
    .track{flex:1;height:100%;}
    .day .cap{flex:none;width:250px;}
    /* The bar IS the tag: it shortens each day. No axis, no numbers. */
    .bar{height:100%;border-radius:4px;background:linear-gradient(90deg,#2f8f57,#1d6b3f);}
    .day.mid .bar{background:linear-gradient(90deg,#e0a11b,#c8890f);}
    .day.late .bar{background:linear-gradient(90deg,${C.acid},${C.acid2});}
    .day .lbl{font-size:21px;color:#9dbdaa;}
    .day.late .lbl{display:inline-block;color:${C.ink};font-weight:700;background:${C.acid};
      padding:7px 16px;border-radius:20px;font-size:22px;}
    .foot{margin-top:38px;color:#fff;}
  `,
  body: `
  <div class="card">
    <div class="kicker body">ТА САМА КУРТКА</div>
    <h1 class="display">Змінюється<br>не куртка.<br><em>Змінюється день.</em></h1>
    <p class="sub body">У секонд-хенді ціна падає з кожним днем після завозу. Карта показує, де кожен магазин у своєму циклі — сьогодні.</p>
    <div class="strip">
      ${[
        [1, 92, '', 'щойно завезли'],
        [2, 80, '', ''],
        [3, 68, 'mid', 'середина циклу'],
        [4, 57, 'mid', ''],
        [5, 45, 'mid', ''],
        [6, 33, 'late', ''],
        [7, 22, 'late', 'найкраща ціна'],
      ].map(([d, w, cls, lbl]) => `
        <div class="day ${cls}">
          <span class="n body">ДЕНЬ ${d}</span>
          <div class="track"><div class="bar" style="width:${w}%"></div></div>
          <span class="cap">${lbl ? `<span class="lbl body">${lbl}</span>` : ''}</span>
        </div>`).join('')}
    </div>
    <div class="foot"><span class="url display">${SITE}</span>
      <span class="cta body">Карта знає, який сьогодні день</span></div>
  </div>`,
};

// ── 2. Owner — the map at night ─────────────────────────────────────────────
// The owner's fear is not "no one likes my shop", it is "no one knows today is
// the day". So: the map, most pins quiet, one lit. Pins are placed from real
// coordinates rather than scattered randomly — it is their city.
// Positions are RANK-normalised per axis, not projected linearly. Lviv's shops
// cluster hard in the centre, so a true projection collapses most of the 131
// into one blob and the poster reads as a dozen stray dots — the opposite of
// the point. Ranking keeps the real east–west and north–south ordering while
// evening out the spacing, so every shop on the map is a shop you can see.
const BAND = { top: 30, bottom: 70 };
const rankOf = (key) => {
  const order = [...stores].sort((a, b) => a[key] - b[key]).map((s) => s.id);
  return new Map(order.map((id, k) => [id, k / (order.length - 1)]));
};
const lngRank = rankOf('lng'), latRank = rankOf('lat');
const pins = stores.map((s) => ({
  id: s.id,
  x: 6 + lngRank.get(s.id) * 88,
  y: BAND.top + (1 - latRank.get(s.id)) * (BAND.bottom - BAND.top),
}));
// The lit pin sits mid-field, so it reads as "one of these is yours" rather
// than as an outlier off on its own.
const heroPin = pins.find((p) => Math.abs(p.x - 50) < 6 && Math.abs(p.y - 50) < 8) || pins[Math.floor(pins.length / 2)];

const owner = {
  name: '2-owner',
  css: `
    body{background:${C.ink};}
    .card{color:#fff;background:${C.ink};}
    .map{position:absolute;inset:0;background:
      radial-gradient(90% 70% at 50% 42%, ${C.green2} 0%, ${C.ink} 70%);}
    .pin{position:absolute;width:15px;height:15px;border-radius:50%;
      background:#8fc3a4;opacity:.82;transform:translate(-50%,-50%);
      box-shadow:0 0 14px rgba(143,195,164,.5);}
    .pin.hero{width:34px;height:34px;background:${C.acid};opacity:1;
      box-shadow:0 0 0 14px rgba(255,210,63,.16), 0 0 0 30px rgba(255,210,63,.07),
                 0 0 46px rgba(255,210,63,.55);}
    /* Opaque behind the type, near-clear across the middle band where the
       pins live — the map is the argument, so it must not be veiled away. */
    .veil{position:absolute;inset:0;background:
      linear-gradient(180deg, ${C.ink} 0%, rgba(13,44,26,.92) 24%, rgba(13,44,26,.05) 42%,
                              rgba(13,44,26,.10) 56%, rgba(13,44,26,.92) 70%, ${C.ink} 100%);}
    .inner{position:relative;padding:72px 64px;display:flex;flex-direction:column;height:100%;}
    .kicker{font-size:24px;letter-spacing:.16em;color:${C.acid};margin-bottom:20px;}
    h1{font-size:80px;}
    h1 em{font-style:normal;color:${C.acid};}
    .mid{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:26px;}
    .sub{font-size:27px;line-height:1.45;color:#d3e8dc;max-width:30ch;}
    .stats{display:flex;gap:14px;flex-wrap:wrap;}
    .stat{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
      border-radius:8px;padding:14px 20px;}
    .stat b{display:block;font-size:38px;line-height:1;color:${C.acid};}
    .stat span{font-size:19px;color:#c6ded0;}
    .foot{margin-top:34px;}
  `,
  body: `
  <div class="card">
    <div class="map">
      ${pins.map((p) => `<div class="pin" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%"></div>`).join('')}
      <div class="pin hero" style="left:${heroPin.x.toFixed(2)}%;top:${heroPin.y.toFixed(2)}%"></div>
    </div>
    <div class="veil"></div>
    <div class="inner">
      <div class="kicker body">ВЛАСНИКАМ МАГАЗИНІВ</div>
      <h1 class="display">Ваш завіз<br>сьогодні.<br><em>Хто про це знає?</em></h1>
      <div class="mid">
        <p class="sub body">Покупці шукають на цій карті, де сьогодні свіжий товар. Магазин без графіка завозу невидимий саме в той день, коли має найбільше.</p>
        <div class="stats">
          <div class="stat"><b class="display">${N}</b><span class="body">${plural(N, 'магазин', 'магазини', 'магазинів')} на карті</span></div>
          <div class="stat"><b class="display">${uah(0)}</b><span class="body">потрапити на карту</span></div>
          <div class="stat"><b class="display">${uah(PRICES.verified)}</b><span class="body">/міс — виділитися</span></div>
        </div>
      </div>
      <div class="foot"><span class="url display">${SITE}</span>
        <span class="cta body">Додати магазин — безкоштовно</span></div>
    </div>
  </div>`,
};

// ── 3. Job — the survey card ────────────────────────────────────────────────
// The honest way to advertise this job is to show the work: one card, filled in
// while standing in a shop. No wage figure on the image — that is a public
// commitment and belongs in the conversation, not in a JPEG that outlives it.
const job = {
  name: '3-job',
  css: `
    body{background:${C.green};}
    .card{padding:64px 56px;background:
      linear-gradient(160deg, ${C.green} 0%, ${C.green2} 100%);}
    .sheet{background:${C.paper};color:${C.ink};border-radius:4px;flex:1;
      padding:52px 48px;display:flex;flex-direction:column;position:relative;
      box-shadow:0 30px 70px rgba(0,0,0,.34);}
    .stamp{position:absolute;top:38px;right:-16px;background:${C.acid};color:${C.ink};
      font-size:26px;letter-spacing:.12em;padding:12px 26px;transform:rotate(3deg);
      box-shadow:0 8px 22px rgba(0,0,0,.22);}
    .no{font-size:20px;letter-spacing:.14em;color:${C.ink2};margin-bottom:18px;}
    h1{font-size:70px;margin-bottom:8px;}
    .role{font-size:27px;color:${C.ink2};margin-bottom:32px;}
    .rule{height:2px;background:${C.ink};opacity:.14;margin-bottom:10px;}
    .task{flex:1;display:flex;gap:18px;align-items:center;
      border-bottom:1px solid ${C.line};}
    .box{flex:none;width:30px;height:30px;border:2.5px solid ${C.ink};border-radius:3px;
      display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;
      margin-top:2px;}
    .box.on{background:${C.ink};color:${C.acid};}
    .task .t{font-size:26px;line-height:1.35;}
    .task .t i{font-style:normal;display:block;font-size:20px;color:${C.ink2};margin-top:3px;}
    .note{padding-top:30px;font-size:23px;line-height:1.45;color:${C.ink2};}
    .note b{color:${C.ink};}
    .foot{margin-top:30px;color:${C.paper};}
  `,
  body: `
  <div class="card">
    <div class="sheet">
      <div class="stamp display">ШУКАЄМО</div>
      <div class="no mono">КАРТКА ВІЗИТУ № 132</div>
      <h1 class="display">Польовий<br>агент</h1>
      <p class="role body">Львів · часткова зайнятість · оплата за кожен підтверджений візит</p>
      <div class="rule"></div>
      <div style="flex:1;display:flex;flex-direction:column;">${[
        ['Зайти в секонд-хенд', 'той, що поруч — або той, якого ще немає на карті'],
        ['Записати графік завозу', 'кілька кнопок у Telegram-боті, без паперів'],
        ['Уточнити години роботи', 'те, що покупець не дізнається інакше'],
        ['Сфотографувати вітрину', 'щоб магазин було видно на карті'],
      ].map(([t, i], k) => `
        <div class="task">
          <div class="box display ${k < 3 ? 'on' : ''}">${k < 3 ? '✓' : ''}</div>
          <div class="t body">${t}<i>${i}</i></div>
        </div>`).join('')}</div>
      <p class="note body">Не потрібен досвід — потрібне вміння зайти й запитати.
        <b>Пишіть у Telegram: @Secondhandlvivbot → 💬 Залишити відгук.</b></p>
    </div>
    <div class="foot"><span class="url display">${SITE}</span>
      <span class="cta body">${N} ${plural(N, 'магазин', 'магазини', 'магазинів')} вже на карті</span></div>
  </div>`,
};

// ── 4. Flash deal — the countdown ───────────────────────────────────────────
// Sold to owners, but drawn as the thing the shopper actually sees: a clock
// running down. The product is urgency, so the poster should feel like it.
const flash = {
  name: '4-flash',
  css: `
    body{background:${C.ink};}
    /* A focused glow behind the dial, not a field-wide wash: the earlier
       version bled amber across half the frame and read as a printing fault. */
    .card{padding:96px 64px 70px;background:
      radial-gradient(40% 21% at 50% 21%, rgba(255,184,0,.45) 0%, rgba(255,184,0,.08) 58%, ${C.ink} 80%),
      ${C.ink};
      color:#fff;justify-content:space-between;}
    /* The ring is rotated, the face is not. Rotating the whole dial threw the
       numeral and its label into each other at this size. */
    /* 330, not 372: the outer ring sits at inset:-16px, so the dial's real
       footprint is 32px wider than the circle and was clipping the frame. */
    .clock{align-self:center;width:330px;height:330px;border-radius:50%;position:relative;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:${C.acid};color:${C.ink};box-shadow:0 26px 70px rgba(0,0,0,.4);}
    .clock::before{content:'';position:absolute;inset:-18px;border-radius:50%;
      border:14px solid rgba(13,44,26,.55);border-top-color:${C.ink};transform:rotate(-18deg);}
    .clock b{font-size:142px;line-height:.84;letter-spacing:-.015em;}
    .clock span{font-size:30px;letter-spacing:.12em;margin-top:10px;}
    .kicker{font-size:24px;letter-spacing:.16em;color:${C.acid};margin-bottom:18px;text-align:center;}
    h1{font-size:76px;text-align:center;margin-bottom:18px;}
    .sub{font-size:26px;line-height:1.45;color:#cfe6da;text-align:center;
      max-width:24ch;margin:0 auto 34px;}
    .tiers{display:flex;gap:12px;justify-content:center;margin-bottom:8px;}
    .tier{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
      border-radius:10px;padding:20px 12px;text-align:center;}
    .tier.rec{background:${C.acid};border-color:${C.acid};color:${C.ink};}
    .tier b{display:block;font-size:34px;line-height:1;margin-bottom:7px;}
    .tier span{font-size:18px;opacity:.85;line-height:1.3;display:block;}
  `,
  body: `
  <div class="card">
    <div class="clock display"><b>3</b><span>ГОДИНИ</span></div>
    <div><div class="kicker body">ДЛЯ ВЛАСНИКІВ МАГАЗИНІВ</div>
    <h1 class="display">Розпродаж<br>сьогодні?</h1>
    <p class="sub body">Запустіть спалах-знижку — вона зʼявиться на карті з живим відліком і зникне сама.</p>
    <div class="tiers">
      <div class="tier"><b class="display">${uah(PRICES.flash3h)}</b><span class="body">3 години</span></div>
      <div class="tier rec"><b class="display">${uah(PRICES.flash24h)}</b><span class="body">24 години</span></div>
      <div class="tier"><b class="display">${uah(PRICES.flash24hAlert)}</b><span class="body">24 год + Telegram</span></div>
    </div></div>
    <div class="foot"><span class="url display">${SITE}</span>
      <span class="cta body">Запуск за хвилину</span></div>
  </div>`,
};

// ── Render ───────────────────────────────────────────────────────────────────
const POSTS = [shopper, owner, job, flash];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const post of POSTS) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(page_html(post.css, post.body), { waitUntil: 'networkidle' });
  // JPEG q92: Instagram's publishing API accepts JPEG only, and every card here
  // has an opaque background, so there is no alpha to lose.
  const buf = await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 });
  writeFileSync(resolve(outDir, `story-${post.name}.jpg`), buf);
  await page.close();
}
await browser.close();
console.log(`Wrote ${POSTS.length} story posts (${W}×${H}) to marketing/instagram/ — prices read live: flash ${uah(PRICES.flash3h)}/${uah(PRICES.flash24h)}/${uah(PRICES.flash24hAlert)}, Verified+ ${uah(PRICES.verified)}/mo.`);
