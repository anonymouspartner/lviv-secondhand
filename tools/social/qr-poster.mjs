// Renders a printable, bilingual (EN/UA) QR poster for physical stores to
// marketing/qr-poster.pdf (A4, print-ready) + marketing/qr-poster.png (preview).
// The QR opens the app. Run: `npm run poster` (see README.md).
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const URL_TARGET = process.env.POSTER_URL || 'https://www.lvivsecondhand.com/';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

// High error-correction so the code still scans if the print is smudged/creased.
const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 1,
  color: { dark: '#14472a', light: '#ffffff' },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:210mm; height:297mm; font-family:'DejaVu Sans',sans-serif; color:#14321f; }
  .page { width:210mm; height:297mm; display:flex; flex-direction:column; background:#fff; }
  .band { background:linear-gradient(135deg,#1b5e38,#0f3d24); color:#fff;
          padding:16mm 18mm 14mm; display:flex; align-items:center; gap:6mm; }
  .band img { width:20mm; height:20mm; border-radius:5mm; }
  .band .w { font-size:30pt; font-weight:700; letter-spacing:-.5px; line-height:1.05; }
  .band .w small { display:block; font-size:12pt; font-weight:400; color:#a7e3c1; letter-spacing:.02em; }
  .body { flex:1; padding:12mm 18mm; display:flex; flex-direction:column; }
  h1 { font-size:27pt; line-height:1.15; font-weight:700; }
  h1 .ua { display:block; font-size:18pt; font-weight:400; color:#4b6b57; margin-top:3mm; }
  .benefits { margin:9mm 0; }
  .benefits li { list-style:none; font-size:13pt; margin-bottom:4mm; padding-left:9mm; position:relative; }
  .benefits li::before { content:"✓"; position:absolute; left:0; top:-1px; color:#1b5e38; font-weight:700; font-size:14pt; }
  .benefits li small { color:#6b8577; }
  .qrwrap { margin-top:auto; display:flex; align-items:center; gap:12mm; }
  .qrcard { width:74mm; height:74mm; flex:none; padding:5mm; border:2px solid #e2e8e4;
            border-radius:6mm; background:#fff; }
  .qrcard svg { width:100%; height:100%; display:block; }
  .scan .lead { font-size:18pt; font-weight:700; }
  .scan .lead .ua { display:block; font-size:13pt; font-weight:400; color:#4b6b57; margin-top:1mm; }
  .scan .url { margin-top:5mm; font-size:15pt; font-weight:700; color:#1b5e38; }
  .foot { padding:8mm 18mm; background:#f2f7f3; color:#4b6b57; font-size:11pt;
          display:flex; justify-content:space-between; }
  .foot b { color:#14321f; }
</style></head><body>
  <div class="page">
    <div class="band">
      <img src="data:image/png;base64,${iconB64}"/>
      <div class="w">Lviv Second Hand<small>Секонд-хенди Львова · карта та завезення</small></div>
    </div>
    <div class="body">
      <h1>Every second-hand store in Lviv, on one map.
        <span class="ua">Усі секонд-хенди Львова на одній карті.</span></h1>
      <ul class="benefits">
        <li>Map, opening hours &amp; directions <small>· Карта, години роботи та маршрут</small></li>
        <li>By-weight &amp; itemized prices <small>· Ціни на вагу та поштучно</small></li>
        <li>Restock days &amp; price-drop timing <small>· Дні завезення та коли найдешевше</small></li>
        <li>Free · no install · English / Українська <small>· Безкоштовно, без встановлення</small></li>
      </ul>
      <div class="qrwrap">
        <div class="qrcard">${qrSvg}</div>
        <div class="scan">
          <div class="lead">Scan to open<span class="ua">Скануй, щоб відкрити</span></div>
          <div class="url">www.lvivsecondhand.com</div>
        </div>
      </div>
    </div>
    <div class="foot"><span><b>www.lvivsecondhand.com</b></span><span>Free &amp; ad-free · Безкоштовно</span></div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// A4 at 96dpi = 794×1123 CSS px; deviceScaleFactor 2 → crisp 1588×2246 preview.
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: resolve(outDir, 'qr-poster.pdf'), format: 'A4', printBackground: true });
// PNG preview: clip to the poster element so there's no extra whitespace.
const png = await page.locator('.page').screenshot();
writeFileSync(resolve(outDir, 'qr-poster.png'), png);
await browser.close();
console.log('Wrote marketing/qr-poster.pdf and marketing/qr-poster.png →', URL_TARGET);
