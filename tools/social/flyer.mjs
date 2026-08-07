// Print-ready A4 sheet of 4 identical A6 HANDOUT FLYERS (UA/EN) for the field
// agent to hand shoppers. Bold & punchy identity (see brand.mjs). Print, cut the
// guides into four A6 flyers; the QR opens the app. Run: `npm run flyer`.
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

const URL_TARGET = process.env.FLYER_URL || 'https://www.lvivsecondhand.com/';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 0,
  color: { dark: C.ink, light: '#ffffff' },
});

// One A6 flyer (105×148mm), repeated 4× on the A4 sheet.
const flyer = `
  <div class="flyer">
    <div class="freetag display">Безкоштовно<span>Free · UA/EN</span></div>

    <div class="brand">
      <img src="data:image/png;base64,${iconB64}"/>
      <div class="wm display">Lviv Second Hand</div>
    </div>

    <div class="hero">
      <div class="kicker display">Секонд-хенди Львова</div>
      <h1 class="display">Усі секонд-<br>хенди Львова</h1>
      <div class="hlline display">на одній карті</div>
      <div class="en body">Every second-hand store in Lviv — on one map.</div>
    </div>

    <ul class="benefits body">
      <li><b>Карта, години, маршрут</b><span>map · hours · directions</span></li>
      <li><b>Ціни на вагу та поштучно</b><span>by-weight &amp; itemized prices</span></li>
      <li><b>Дні завезення — коли найдешевше</b><span>restock days · best-price timing</span></li>
    </ul>

    <div class="foot">
      <div class="qr">${qrSvg}</div>
      <div class="cta">
        <div class="scan display">Скануй</div>
        <div class="scan-en body">Scan to open the free map</div>
        <div class="url mono">www.lvivsecondhand.com</div>
      </div>
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  ${CSS}
  html,body { width:210mm; height:297mm; }
  .sheet { width:210mm; height:297mm; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
  .flyer { position:relative; width:105mm; height:148.5mm; overflow:hidden; padding:8mm 7.5mm 7.5mm;
           color:${C.paper}; background:radial-gradient(125% 95% at 82% -10%, ${C.green} 0%, ${C.ink} 62%);
           outline:0.3mm dashed rgba(255,255,255,.28); outline-offset:-0.15mm;
           display:flex; flex-direction:column; }
  .brand { display:flex; align-items:center; gap:2.5mm; }
  .brand img { width:9mm; height:9mm; border-radius:2.4mm; }
  .brand .wm { font-size:11.5pt; letter-spacing:.02em; color:#fff; }
  .hero { margin-top:5mm; }
  .kicker { font-size:8pt; color:${C.acid}; letter-spacing:.18em; margin-bottom:2mm; }
  h1 { font-size:27pt; line-height:1.0; color:#fff; }
  .hlline { display:inline-block; font-size:21pt; line-height:1; color:${C.ink};
            background:${C.acid}; padding:1mm 1.8mm 1.4mm; margin-top:2mm; }
  .en { margin-top:4mm; font-size:9.5pt; color:#cfe6d7; max-width:88%; line-height:1.25; }
  .benefits { margin-top:auto; list-style:none; display:flex; flex-direction:column; gap:2.8mm; padding-bottom:1mm; }
  .benefits li { position:relative; padding-left:6.5mm; }
  .benefits li::before { content:""; position:absolute; left:0; top:.9mm; width:3.4mm; height:3.4mm; background:${C.acid};
                         clip-path:polygon(0 0,100% 0,100% 100%); }
  .benefits b { display:block; font-size:11pt; font-weight:700; color:#fff; line-height:1.12; }
  .benefits span { font-size:7.5pt; color:#9ec4ac; letter-spacing:.02em; }
  .foot { margin-top:5mm; display:flex; align-items:center; gap:4mm; }
  .qr { width:25mm; height:25mm; flex:none; background:#fff; padding:1.8mm; border-radius:2mm; border:0.9mm solid ${C.acid}; }
  .qr svg { width:100%; height:100%; display:block; }
  .cta { flex:1; min-width:0; }
  .scan { font-size:18pt; color:${C.acid}; line-height:1; }
  .scan-en { font-size:8pt; color:#cfe6d7; margin-top:1mm; }
  .url { font-size:8.6pt; font-weight:700; color:#fff; margin-top:2.4mm; letter-spacing:-.01em; white-space:nowrap; }
  .freetag { position:absolute; top:6mm; right:5.5mm; z-index:3; transform:rotate(6deg); text-align:center;
             background:${C.acid}; color:${C.ink}; font-size:10.5pt; line-height:1; padding:2.4mm 3mm; border-radius:1.8mm;
             box-shadow:0 1mm 2.5mm rgba(0,0,0,.28); }
  .freetag span { display:block; font-family:'DejaVu Sans',sans-serif; font-weight:700; text-transform:none; font-size:6.5pt; letter-spacing:.01em; margin-top:.8mm; color:${C.green2}; }
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
