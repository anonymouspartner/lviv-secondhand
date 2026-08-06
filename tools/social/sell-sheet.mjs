// Renders a printable, bilingual (UA/EN) one-page SELL-SHEET for pitching store
// owners on paid promotions → marketing/sell-sheet.pdf (A4) + .png (preview).
// Prices mirror docs/ADVERTISING.md — keep them in sync. Run: `npm run sellsheet`.
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const URL_TARGET = process.env.SELLSHEET_URL || 'https://www.lvivsecondhand.com/';
const CONTACT = process.env.SELLSHEET_CONTACT || '@Secondhandlvivbot'; // override with a phone/Telegram
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 1,
  color: { dark: '#14472a', light: '#ffffff' },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:210mm; height:297mm; font-family:'DejaVu Sans',sans-serif; color:#14321f; }
  .page { width:210mm; height:297mm; display:flex; flex-direction:column; background:#fff; }
  .band { background:linear-gradient(135deg,#1b5e38,#0f3d24); color:#fff; padding:13mm 16mm 11mm; display:flex; align-items:center; gap:6mm; }
  .band img { width:18mm; height:18mm; border-radius:5mm; }
  .band .w { font-size:23pt; font-weight:800; line-height:1.05; }
  .band .w small { display:block; font-size:11pt; font-weight:400; color:#a7e3c1; margin-top:1mm; }
  .body { flex:1; padding:9mm 16mm; display:flex; flex-direction:column; }
  h1 { font-size:20pt; line-height:1.15; font-weight:800; }
  h1 .en { display:block; font-size:12.5pt; font-weight:400; color:#4b6b57; margin-top:2mm; }
  .lead { margin:5mm 0 6mm; font-size:11.5pt; color:#33503f; line-height:1.4; }
  .grid { display:flex; gap:8mm; }
  .col { flex:1; }
  .mock { border:1.5px solid #e6a817; border-radius:4mm; overflow:hidden; box-shadow:0 1mm 3mm rgba(0,0,0,.08); }
  .mock .badge { background:#fbe7a2; color:#7a5600; font-size:8.5pt; font-weight:800; padding:2mm 3mm; }
  .mock .mname { font-size:12pt; font-weight:800; padding:2mm 3mm 0; }
  .mock .maddr { font-size:8.5pt; color:#6b8577; padding:0 3mm 2mm; }
  .mock .moffer { background:#fff8e1; color:#7a5600; font-weight:700; font-size:9.5pt; padding:2mm 3mm; }
  .benefits li { list-style:none; font-size:10.5pt; margin-bottom:2.5mm; padding-left:7mm; position:relative; line-height:1.3; }
  .benefits li::before { content:"✓"; position:absolute; left:0; color:#1b5e38; font-weight:800; }
  .benefits li small { color:#6b8577; }
  table.tiers { width:100%; border-collapse:collapse; margin:7mm 0 5mm; font-size:10pt; }
  table.tiers th, table.tiers td { border:1px solid #dfeae3; padding:3mm; text-align:left; vertical-align:top; }
  table.tiers th { background:#eaf7ee; font-size:10.5pt; }
  table.tiers .price { font-weight:800; color:#1b5e38; white-space:nowrap; }
  table.tiers tr.feature td { background:#fffdf5; }
  .foot { margin-top:auto; display:flex; align-items:center; gap:8mm; padding-top:4mm; border-top:1px solid #e2e8e4; }
  .qrcard { width:34mm; height:34mm; flex:none; padding:2.5mm; border:1.5px solid #e2e8e4; border-radius:4mm; }
  .qrcard svg { width:100%; height:100%; display:block; }
  .foot .cta .big { font-size:13pt; font-weight:800; }
  .foot .cta .sub { font-size:10pt; color:#4b6b57; margin-top:1.5mm; }
  .foot .cta .contact { font-size:11pt; font-weight:700; color:#1b5e38; margin-top:2mm; }
</style></head><body>
  <div class="page">
    <div class="band">
      <img src="data:image/png;base64,${iconB64}"/>
      <div class="w">Реклама для вашого магазину<small>Lviv Second Hand · advertise your store on the map</small></div>
    </div>
    <div class="body">
      <h1>Покупці щодня шукають секонд-хенди Львова на нашій карті.
        <span class="en">Shoppers browse Lviv's second-hand stores on our free map every day — be the one they see first.</span></h1>
      <div class="lead">Безкоштовна двомовна карта та Telegram-бот з годинами роботи, цінами й днями завезення.
        Виділіть свій магазин — золота позначка, перше місце у списку та ваша акція. ·
        Free bilingual map + Telegram bot. Stand out with a gold pin, top-of-list placement, and your offer.</div>

      <div class="grid">
        <div class="col">
          <div class="mock">
            <div class="badge">⭐ РЕКЛАМА · SPONSORED</div>
            <div class="mname">Ваш магазин</div>
            <div class="maddr">вул. Приклад, 1 · your address</div>
            <div class="moffer">🎁 -10% з застосунком · -10% with the app</div>
          </div>
        </div>
        <div class="col">
          <ul class="benefits">
            <li>Золота ⭐ позначка на карті <small>· Gold pin, floating above the rest</small></li>
            <li>Перше місце у списку <small>· Top of the list in your area</small></li>
            <li>Ваша акція для покупців <small>· Your offer shown to shoppers</small></li>
            <li>Слот у Telegram-боті та у «знижках тижня» <small>· Bot + weekly-deals slot</small></li>
          </ul>
        </div>
      </div>

      <table class="tiers">
        <tr><th>Пакет · Plan</th><th>Що входить · Includes</th><th>Ціна/міс · ₴/mo</th></tr>
        <tr><td><b>Verified+</b></td><td>Фото, телефон, години, значок «перевірено», рядок акції · Photos, phone, hours, verified badge, offer line</td><td class="price">₴250</td></tr>
        <tr class="feature"><td><b>Featured</b></td><td>Verified+ та золота позначка + перше місце + ⭐ · plus gold pin, top-of-list, ⭐ badge</td><td class="price">₴600</td></tr>
        <tr><td><b>Spotlight</b></td><td>Featured та «знижка тижня» + бот + банер · plus deal-of-week, bot line, homepage banner</td><td class="price">₴1200</td></tr>
      </table>

      <div class="foot">
        <div class="qrcard">${qrSvg}</div>
        <div class="cta">
          <div class="big">Хочете виділитися? · Want to stand out?</div>
          <div class="sub">Скануйте, щоб побачити карту · Scan to see the live map. Перший місяць Featured — ₴300 (−50%). </div>
          <div class="contact">📩 ${CONTACT}</div>
        </div>
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
