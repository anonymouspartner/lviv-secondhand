// Print-ready A4 in-store POSTER (wall/window). Bold & punchy identity (brand.mjs).
// The QR opens the app. Run: `npm run poster` (override target with POSTER_URL=…).
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

const URL_TARGET = process.env.POSTER_URL || 'https://www.lvivsecondhand.com/';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 0,
  color: { dark: C.ink, light: '#ffffff' },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  ${CSS}
  html,body { width:210mm; height:297mm; }
  .poster { position:relative; width:210mm; height:297mm; overflow:hidden; padding:20mm 18mm 16mm;
            color:${C.paper}; background:radial-gradient(120% 80% at 84% -6%, ${C.green} 0%, ${C.ink} 58%);
            display:flex; flex-direction:column; }
  .freetag { position:absolute; top:13mm; right:13mm; z-index:3; transform:rotate(6deg); text-align:center;
             background:${C.acid}; color:${C.ink}; font-size:17pt; line-height:1; padding:3.5mm 4.5mm; border-radius:3mm;
             box-shadow:0 2mm 5mm rgba(0,0,0,.3); }
  .freetag span { display:block; font-family:'DejaVu Sans',sans-serif; font-weight:700; text-transform:none; font-size:8.5pt; letter-spacing:.01em; margin-top:1.2mm; color:${C.green2}; }
  .brand { display:flex; align-items:center; gap:5mm; }
  .brand img { width:20mm; height:20mm; border-radius:5mm; }
  .brand .wm { font-size:24pt; letter-spacing:.01em; color:#fff; }
  .brand .wm small { display:block; font-family:'DejaVu Sans',sans-serif; font-weight:400; text-transform:none; font-size:10.5pt; letter-spacing:.02em; color:${C.acid}; margin-top:1mm; }
  .hero { margin-top:13mm; }
  h1 { font-size:66pt; line-height:.96; color:#fff; }
  .hlline { display:inline-block; font-size:52pt; line-height:1; color:${C.ink}; background:${C.acid}; padding:2mm 4mm 4mm; margin-top:8mm; }
  .en { margin-top:9mm; font-size:16pt; color:#cfe6d7; max-width:72%; line-height:1.3; }
  .benefits { margin-top:14mm; list-style:none; display:flex; flex-direction:column; gap:6mm; }
  .benefits li { position:relative; padding-left:13mm; }
  .benefits li::before { content:""; position:absolute; left:0; top:1.5mm; width:7mm; height:7mm; background:${C.acid};
                         clip-path:polygon(0 0,100% 0,100% 100%); }
  .benefits b { display:block; font-size:19pt; font-weight:700; color:#fff; line-height:1.12; }
  .benefits span { font-size:12pt; color:#9ec4ac; letter-spacing:.02em; }
  .foot { margin-top:auto; display:flex; align-items:center; gap:10mm; padding-top:10mm; }
  .qr { width:62mm; height:62mm; flex:none; background:#fff; padding:4mm; border-radius:5mm; border:2.4mm solid ${C.acid}; }
  .qr svg { width:100%; height:100%; display:block; }
  .scan { font-size:40pt; color:${C.acid}; line-height:.95; }
  .scan-en { font-family:'DejaVu Sans',sans-serif; font-size:15pt; color:#cfe6d7; margin-top:2.5mm; }
  .url { font-size:17pt; font-weight:700; color:#fff; margin-top:6mm; white-space:nowrap; }
</style></head><body>
  <div class="poster">
    <div class="freetag display">Безкоштовно<span>Free · без встановлення · UA/EN</span></div>
    <div class="brand">
      <img src="data:image/png;base64,${iconB64}"/>
      <div class="wm display">Lviv Second Hand<small>Секонд-хенди Львова · карта та ціни</small></div>
    </div>
    <div class="hero">
      <h1 class="display">Усі секонд-<br>хенди Львова</h1>
      <div class="hlline display">на одній карті</div>
      <div class="en body">Every second-hand store in Lviv — hours, prices &amp; restock timing, on one free map.</div>
    </div>
    <ul class="benefits body">
      <li><b>Карта, години роботи, маршрут</b><span>map · opening hours · directions</span></li>
      <li><b>На вагу чи поштучно</b><span>by weight or by item</span></li>
      <li><b>Дні завезення — коли найдешевше</b><span>restock days &amp; best-price timing</span></li>
    </ul>
    <div class="foot">
      <div class="qr">${qrSvg}</div>
      <div class="cta">
        <div class="scan display">Скануй<br>тут</div>
        <div class="scan-en">Scan to open the free map</div>
        <div class="url mono">www.lvivsecondhand.com</div>
      </div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: resolve(outDir, 'qr-poster.pdf'), format: 'A4', printBackground: true });
const png = await page.locator('.poster').screenshot();
writeFileSync(resolve(outDir, 'qr-poster.png'), png);
await browser.close();
console.log('Wrote marketing/qr-poster.pdf and marketing/qr-poster.png →', URL_TARGET);
