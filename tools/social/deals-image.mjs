// Renders a 1080×1080 "best deals right now" share image (Instagram/Telegram)
// from the app's /cheap logic, straight out of stores.json (single source of
// truth, same file index.html fetches at runtime). Run: `npm run deals` →
// marketing/deals-this-week.jpg + deals-caption.txt
//
// JPEG, not PNG: Instagram's publishing API accepts JPEG only and rejects a PNG
// image_url with a generic container error. The card background is opaque, so
// there is no alpha to lose.
//
// The ranking mirrors telegram-bot/worker.js cheapText(): by-weight stores with
// a fixed weekly restock day, ranked by how many days they are into their weekly
// cycle (furthest in = deepest discount today).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ── Load STORES from stores.json (same source index.html fetches at runtime) ──
const STORES = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'));

// ── /cheap ranking ──
const kyivWeekday = () => {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', weekday: 'short' })
    .format(new Date()).toLowerCase().slice(0, 3);
  return DAYS.includes(wd) ? wd : 'mon';
};
const idx = DAYS.indexOf(kyivWeekday());
const ranked = STORES
  .filter((s) => !s.watermark && s.restockDay)
  .map((s) => ({ s, days: (idx - DAYS.indexOf(s.restockDay) + 7) % 7 }))
  .sort((a, b) => b.days - a.days)
  .slice(0, 6);

const dateEN = new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Europe/Kyiv', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Heat: more days into the cycle → hotter (cheaper). 0 days = fresh (green).
const heat = (d) => d === 0 ? '#1b7a45' : ['#c98a00', '#d97706', '#e0590a', '#dc4a1e', '#dc2626', '#c81e1e'][Math.min(d, 6) - 1] || '#dc2626';
// Paid sponsored slot (clearly labelled). Rotates daily if several are featured.
const activeP = (s) => (s.promo && (!s.promo.until || new Date(s.promo.until + 'T23:59:59') >= new Date())) ? s.promo : null;
const promoted = STORES.filter((s) => !s.watermark && activeP(s));
const sponsored = promoted.length ? promoted[new Date().getDate() % promoted.length] : null;
const sponsoredRow = sponsored ? `<div class="row sponsored">
    <div class="rank">⭐</div>
    <div class="info"><div class="name">${esc(sponsored.name)}</div>
      <div class="sub">Реклама · Sponsored${activeP(sponsored).offer ? ' — ' + esc(activeP(sponsored).offer) : ''}</div></div>
  </div>` : '';

// Keep the card to 6 rows total so the footer never clips.
const rankedShown = sponsored ? ranked.slice(0, 5) : ranked;
const rows = sponsoredRow + rankedShown.map(({ s, days }, i) => {
  const label = days === 0 ? 'Restocked today · full selection'
    : `${days} day${days > 1 ? 's' : ''} into the cycle · cheaper`;
  return `<div class="row">
    <div class="rank">${i + 1}</div>
    <div class="info"><div class="name">${esc(s.name)}</div>
      <div class="sub" style="color:${heat(days)}">${label}</div></div>
  </div>`;
}).join('');

const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const page_html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1080px; font-family:'DejaVu Sans',sans-serif; }
  .card { width:1080px; height:1080px; background:linear-gradient(160deg,#12401f,#0b2f18);
          color:#fff; padding:52px 60px; display:flex; flex-direction:column; }
  .top { display:flex; align-items:center; gap:18px; margin-bottom:12px; }
  .top img { width:56px; height:56px; border-radius:14px; }
  .top b { font-size:26px; font-weight:700; }
  .top .date { margin-left:auto; font-size:22px; color:#a7e3c1; }
  h1 { font-size:52px; line-height:1.04; font-weight:700; letter-spacing:-1px; }
  h1 .ua { display:block; font-size:30px; font-weight:400; color:#bfe6cf; margin-top:6px; }
  .list { margin-top:22px; flex:1; display:flex; flex-direction:column; gap:12px; }
  .row { display:flex; align-items:center; gap:20px; background:rgba(255,255,255,.07);
         border:1px solid rgba(255,255,255,.10); border-radius:18px; padding:15px 24px; }
  .rank { font-size:32px; font-weight:700; color:#7fd0a0; width:42px; flex:none; text-align:center; }
  .info { flex:1; min-width:0; }
  .name { font-size:29px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sub { font-size:22px; font-weight:700; margin-top:3px; }
  .row.sponsored { background:rgba(230,168,23,.18); border-color:rgba(230,168,23,.55); }
  .row.sponsored .rank { color:#ffd257; }
  .row.sponsored .sub { color:#ffd257; }
  .foot { margin-top:22px; display:flex; align-items:center; justify-content:space-between;
          font-size:21px; color:#bfe6cf; }
  .foot b { color:#fff; }
</style></head><body>
  <div class="card">
    <div class="top"><img src="data:image/png;base64,${iconB64}"/><b>Lviv Second Hand</b>
      <span class="date">${esc(dateEN)}</span></div>
    <h1>Best by-weight deals right now
      <span class="ua">Найкращі ціни на вагу зараз</span></h1>
    <div class="list">${rows || "<div class='row'><div class='info'><div class='name'>Open the map for today's stores</div></div></div>"}</div>
    <div class="foot"><span>Prices drop daily after each restock · Ціни падають щодня</span>
      <span><b>www.lvivsecondhand.com</b></span></div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(page_html, { waitUntil: 'networkidle' });
const buf = await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 });
writeFileSync(resolve(outDir, 'deals-this-week.jpg'), buf);
await browser.close();

// Caption written alongside the image so the Instagram post describes THIS
// week's ranking rather than repeating a generic line. The workflow reads this
// file rather than hardcoding text that would drift from the picture.
const top = ranked[0];
const lead = top
  ? `Цього тижня найдешевше: ${top.s.name}${top.days ? ` — ${top.days} ${top.days === 1 ? 'день' : top.days < 5 ? 'дні' : 'днів'} після завозу.` : '.'}`
  : 'Ціни на вагу падають щодня після завозу.';
const caption = [
  '🧥 Найкращі ціни на вагу зараз',
  '',
  lead,
  'У секонд-хенді ціна падає з кожним днем після завозу — карта показує, де кожен магазин у своєму циклі.',
  '',
  'Оновлюється щопонеділка → www.lvivsecondhand.com',
  '',
  '#секондхенд #секондхендльвів #львів #lviv #шопінгльвів #thrifting #secondhand #вінтаж #ukraine',
].join('\n');
writeFileSync(resolve(outDir, 'deals-caption.txt'), caption + '\n');

console.log(`Wrote marketing/deals-this-week.jpg + deals-caption.txt — ${ranked.length} stores ranked for ${dateEN} (Kyiv).`);
