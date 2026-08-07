// Print-ready A4 sheet of 24 small QR STICKERS (4×6) the field agent places in and
// around stores. Bold & punchy identity (brand.mjs). Print on adhesive label paper,
// cut along the guides; the QR opens the app. Run: `npm run stickers`.
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

const URL_TARGET = process.env.STICKER_URL || 'https://www.lvivsecondhand.com/';
const COLS = 4, ROWS = 6; // 24 per A4
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 0,
  color: { dark: C.ink, light: '#ffffff' },
});

// One sticker: deep-green ground, brand lockup, white-framed QR, acid CTA + URL.
const sticker = `
  <div class="cell">
    <div class="sticker">
      <div class="brand">
        <img src="data:image/png;base64,${iconB64}"/>
        <div class="wm display">Lviv Second<br>Hand</div>
      </div>
      <div class="qr">${qrSvg}</div>
      <div class="cta">
        <div class="scan display">Скануй карту</div>
        <div class="url mono">www.lvivsecondhand.com</div>
      </div>
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  ${CSS}
  html,body { width:210mm; height:297mm; }
  .sheet { width:210mm; height:297mm; display:grid;
           grid-template-columns:repeat(${COLS}, 1fr); grid-template-rows:repeat(${ROWS}, 1fr); }
  .cell { position:relative; display:flex; align-items:stretch; justify-content:stretch; padding:2.5mm;
          outline:0.3mm dashed #c3d2c9; }
  .sticker { position:relative; flex:1; overflow:hidden; border-radius:3mm; padding:4mm 4mm 3.5mm;
             color:${C.paper}; background:radial-gradient(130% 100% at 82% -12%, ${C.green} 0%, ${C.ink} 66%);
             display:flex; flex-direction:column; align-items:center; text-align:center; }
  .brand { display:flex; align-items:center; gap:2mm; align-self:stretch; }
  .brand img { width:7mm; height:7mm; border-radius:1.8mm; flex:none; }
  .brand .wm { font-size:8.5pt; line-height:.9; color:#fff; text-align:left; }
  .qr { width:26mm; height:26mm; margin:2.6mm 0 2.2mm; background:#fff; padding:1.6mm; border-radius:1.8mm;
        border:0.8mm solid ${C.acid}; }
  .qr svg { width:100%; height:100%; display:block; }
  .cta { margin-top:auto; }
  .scan { font-size:12pt; color:${C.acid}; line-height:1; }
  .url { font-size:6.4pt; font-weight:700; color:#fff; margin-top:1.4mm; letter-spacing:-.01em; white-space:nowrap; }
</style></head><body>
  <div class="sheet">${sticker.repeat(COLS * ROWS)}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: resolve(outDir, 'qr-stickers.pdf'), format: 'A4', printBackground: true });
const png = await page.locator('.sheet').screenshot();
writeFileSync(resolve(outDir, 'qr-stickers.png'), png);
await browser.close();
console.log(`Wrote marketing/qr-stickers.pdf and marketing/qr-stickers.png — ${COLS * ROWS} stickers →`, URL_TARGET);
