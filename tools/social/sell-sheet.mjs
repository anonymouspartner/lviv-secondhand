// Print-ready A4 SELL-SHEET for pitching store owners on paid promotions.
// Bold & punchy identity (brand.mjs). Prices mirror docs/ADVERTISING.md.
// Run: `npm run sellsheet` (override contact with SELLSHEET_CONTACT=…).
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CSS, C } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const URL_TARGET = process.env.SELLSHEET_URL || 'https://www.lvivsecondhand.com/';
const CONTACT = process.env.SELLSHEET_CONTACT || '@Secondhandlvivbot';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 0,
  color: { dark: C.ink, light: '#ffffff' },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  ${CSS}
  html,body { width:210mm; height:297mm; }
  .page { width:210mm; height:297mm; background:${C.paper}; color:${C.ink2}; display:flex; flex-direction:column; }

  .head { position:relative; background:radial-gradient(120% 120% at 88% -20%, ${C.green} 0%, ${C.ink} 65%);
          color:${C.paper}; padding:13mm 16mm 12mm; overflow:hidden; }
  .brand { display:flex; align-items:center; gap:4mm; }
  .brand img { width:13mm; height:13mm; border-radius:3.4mm; }
  .brand .wm { font-size:15pt; color:#fff; letter-spacing:.01em; }
  h1 { font-size:35pt; line-height:1.12; color:#fff; margin-top:7mm; }
  h1 .hl { color:${C.ink}; background:${C.acid}; padding:.4mm 2.2mm; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
  .sub { font-family:'DejaVu Sans',sans-serif; font-size:11.5pt; color:#cfe6d7; margin-top:5mm; line-height:1.4; max-width:86%; }

  .body { flex:1; padding:9mm 16mm 0; display:flex; flex-direction:column; }
  .gets { display:flex; gap:5mm; margin-bottom:8mm; }
  .get { flex:1; }
  .get .ic { width:8mm; height:8mm; background:${C.green}; color:${C.acid}; border-radius:2mm; display:flex;
             align-items:center; justify-content:center; font-size:12pt; font-weight:700; }
  .get b { display:block; font-size:10.5pt; color:${C.ink}; margin-top:2.5mm; line-height:1.15; }
  .get span { font-size:8pt; color:#7d907f; }

  table.tiers { width:100%; border-collapse:separate; border-spacing:0 2.5mm; }
  table.tiers td { padding:4mm 5mm; vertical-align:middle; background:#fff; border-top:1px solid ${C.line}; border-bottom:1px solid ${C.line}; }
  table.tiers td:first-child { border-left:1px solid ${C.line}; border-radius:3mm 0 0 3mm; }
  table.tiers td:last-child { border-right:1px solid ${C.line}; border-radius:0 3mm 3mm 0; text-align:right; white-space:nowrap; }
  .tname { font-family:'Oswald',sans-serif; font-weight:700; text-transform:uppercase; font-size:15pt; color:${C.ink}; letter-spacing:.01em; }
  .tinc { font-size:9pt; color:#5f7468; line-height:1.35; }
  .price { font-family:'Oswald',sans-serif; font-weight:700; font-size:23pt; color:${C.green}; }
  .price small { font-family:'DejaVu Sans',sans-serif; font-weight:400; font-size:9pt; color:#7d907f; display:block; text-transform:none; }
  tr.feature td { background:${C.acid}; border-color:${C.acid2}; }
  tr.feature .tinc { color:${C.green2}; }
  tr.feature .price { color:${C.ink}; }
  tr.feature .price small { color:${C.green2}; }
  .badge { display:inline-block; font-family:'Oswald',sans-serif; font-weight:700; text-transform:uppercase; font-size:7.5pt;
           letter-spacing:.06em; background:${C.green}; color:${C.acid}; padding:.6mm 2mm; border-radius:1.4mm; margin-left:2.5mm; vertical-align:2px; }

  .foot { margin-top:auto; background:${C.ink}; color:${C.paper}; padding:9mm 16mm; display:flex; align-items:center; gap:8mm; }
  .qr { width:34mm; height:34mm; flex:none; background:#fff; padding:2.5mm; border-radius:3mm; border:1.4mm solid ${C.acid}; }
  .qr svg { width:100%; height:100%; display:block; }
  .cta { flex:1; }
  .cta .big { font-family:'Oswald',sans-serif; font-weight:700; text-transform:uppercase; font-size:19pt; color:#fff; line-height:1; }
  .cta .offer { display:inline-block; background:${C.acid}; color:${C.ink}; font-weight:700; font-size:9.5pt; padding:1.6mm 3mm; border-radius:1.6mm; margin-top:3mm; }
  .cta .contact { font-family:'DejaVu Sans Mono',monospace; font-size:12pt; font-weight:700; color:${C.acid}; margin-top:4mm; }
</style></head><body>
  <div class="page">
    <div class="head">
      <div class="brand"><img src="data:image/png;base64,${iconB64}"/><div class="wm display">Lviv Second Hand</div></div>
      <h1 class="display">Реклама для<br>вашого <span class="hl">магазину</span></h1>
      <div class="sub">Покупці щодня шукають секонд-хенди Львова на нашій безкоштовній карті. Будьте першими, кого вони бачать. · Shoppers browse Lviv's second-hand stores on our free map every day — be the first they see.</div>
    </div>

    <div class="body">
      <div class="gets">
        <div class="get"><div class="ic">★</div><b>Золота позначка на карті</b><span>Gold pin on the map</span></div>
        <div class="get"><div class="ic">↑</div><b>Перше місце у списку</b><span>Top of the list</span></div>
        <div class="get"><div class="ic">%</div><b>Ваша акція покупцям</b><span>Your offer to shoppers</span></div>
        <div class="get"><div class="ic">◎</div><b>Слот у боті та знижках</b><span>Bot + deals slot</span></div>
      </div>

      <table class="tiers">
        <tr>
          <td><span class="tname">Verified+</span></td>
          <td><div class="tinc">Фото, телефон, години, значок «перевірено», рядок акції · Photos, phone, hours, verified badge, offer line</div></td>
          <td><span class="price">₴250<small>/міс · mo</small></span></td>
        </tr>
        <tr class="feature">
          <td><span class="tname">Featured</span><span class="badge">хіт · popular</span></td>
          <td><div class="tinc">Verified+ та золота позначка + перше місце + ★ · plus gold pin, top-of-list, ★ badge</div></td>
          <td><span class="price">₴600<small>/міс · mo</small></span></td>
        </tr>
        <tr>
          <td><span class="tname">Spotlight</span></td>
          <td><div class="tinc">Featured та «знижка тижня» + бот + банер · plus deal-of-week, bot line, homepage banner</div></td>
          <td><span class="price">₴1200<small>/міс · mo</small></span></td>
        </tr>
      </table>
    </div>

    <div class="foot">
      <div class="qr">${qrSvg}</div>
      <div class="cta">
        <div class="big">Хочете виділитися? · Want to stand out?</div>
        <div class="offer">Перший місяць Featured — ₴300 (−50%)</div>
        <div class="contact">Telegram · ${CONTACT}</div>
      </div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: resolve(outDir, 'sell-sheet.pdf'), format: 'A4', printBackground: true });
const png = await page.locator('.page').screenshot();
writeFileSync(resolve(outDir, 'sell-sheet.png'), png);
await browser.close();
console.log('Wrote marketing/sell-sheet.pdf and marketing/sell-sheet.png →', URL_TARGET);
