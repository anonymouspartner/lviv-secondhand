// Renders a print-ready A4 sheet of 4 identical A6 HANDOUT FLYERS (UA/EN) that the
// field agent gives to shoppers → marketing/flyer.pdf + .png. Print, cut along the
// guides into four A6 flyers. The QR opens the app. Run: `npm run flyer`.
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const URL_TARGET = process.env.FLYER_URL || 'https://www.lvivsecondhand.com/';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 1,
  color: { dark: '#14472a', light: '#ffffff' },
});

// One A6 flyer (105×148mm). Repeated 4× on the A4 sheet below.
const flyer = `
  <div class="flyer">
    <div class="band">
      <img src="data:image/png;base64,${iconB64}"/>
      <div class="w">Lviv Second Hand<small>карта секонд-хендів Львова</small></div>
    </div>
    <div class="body">
      <h1>Усі секонд-хенди Львова на одній карті.
        <span class="en">Every second-hand store in Lviv, on one map.</span></h1>
      <ul class="benefits">
        <li>Карта, години роботи, маршрут <small>· map, hours, directions</small></li>
        <li>Ціни на вагу та поштучно <small>· by-weight &amp; itemized prices</small></li>
        <li>Дні завезення й коли найдешевше <small>· restock days &amp; best-price timing</small></li>
      </ul>
      <div class="qrrow">
        <div class="qrcard">${qrSvg}</div>
        <div class="scan">
          <div class="lead">Скануй, щоб відкрити<span class="en">Scan to open</span></div>
          <div class="url">www.lvivsecondhand.com</div>
          <div class="free">Безкоштовно · без встановлення · UA/EN</div>
        </div>
      </div>
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:210mm; height:297mm; font-family:'DejaVu Sans',sans-serif; color:#14321f; }
  .sheet { width:210mm; height:297mm; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
  .flyer { width:105mm; height:148.5mm; border:0.3mm dashed #b9c9bf; overflow:hidden; display:flex; flex-direction:column; background:#fff; }
  .band { background:linear-gradient(135deg,#1b5e38,#0f3d24); color:#fff; padding:7mm 8mm 6mm; display:flex; align-items:center; gap:4mm; }
  .band img { width:13mm; height:13mm; border-radius:3.5mm; }
  .band .w { font-size:15pt; font-weight:800; line-height:1.05; }
  .band .w small { display:block; font-size:8pt; font-weight:400; color:#a7e3c1; margin-top:0.5mm; }
  .body { flex:1; padding:6mm 8mm; display:flex; flex-direction:column; }
  h1 { font-size:14pt; line-height:1.15; font-weight:800; }
  h1 .en { display:block; font-size:9pt; font-weight:400; color:#4b6b57; margin-top:1.5mm; }
  .benefits { margin:4.5mm 0; }
  .benefits li { list-style:none; font-size:9.5pt; margin-bottom:2.5mm; padding-left:6mm; position:relative; line-height:1.25; }
  .benefits li::before { content:"✓"; position:absolute; left:0; top:-0.3mm; color:#1b5e38; font-weight:800; }
  .benefits li small { color:#6b8577; }
  .qrrow { margin-top:auto; display:flex; align-items:center; gap:6mm; }
  .qrcard { width:34mm; height:34mm; flex:none; padding:2mm; border:1.2px solid #e2e8e4; border-radius:3.5mm; }
  .qrcard svg { width:100%; height:100%; display:block; }
  .scan .lead { font-size:11pt; font-weight:800; line-height:1.15; }
  .scan .lead .en { display:block; font-size:8.5pt; font-weight:400; color:#4b6b57; margin-top:0.5mm; }
  .scan .url { margin-top:2.5mm; font-size:10pt; font-weight:800; color:#1b5e38; }
  .scan .free { margin-top:2mm; font-size:7.5pt; color:#6b8577; }
</style></head><body>
  <div class="sheet">${flyer}${flyer}${flyer}${flyer}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: resolve(outDir, 'flyer.pdf'), format: 'A4', printBackground: true });
const png = await page.locator('.sheet').screenshot();
writeFileSync(resolve(outDir, 'flyer.png'), png);
await browser.close();
console.log('Wrote marketing/flyer.pdf and marketing/flyer.png →', URL_TARGET);
