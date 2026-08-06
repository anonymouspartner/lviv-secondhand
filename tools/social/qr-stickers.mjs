// Renders a print-ready A4 sheet of 24 small QR STICKERS (4×6) the field agent can
// place in/around stores → marketing/qr-stickers.pdf + .png. Print (ideally on
// adhesive label paper) and cut along the guides. The QR opens the app.
// Run: `npm run stickers`.
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing');
mkdirSync(outDir, { recursive: true });

const URL_TARGET = process.env.STICKER_URL || 'https://www.lvivsecondhand.com/';
const COLS = 4, ROWS = 6; // 24 per A4

const qrSvg = await QRCode.toString(URL_TARGET, {
  type: 'svg', errorCorrectionLevel: 'H', margin: 1,
  color: { dark: '#14472a', light: '#ffffff' },
});

const sticker = `
  <div class="cell">
    <div class="sticker">
      <div class="top">🧥 Lviv Second Hand</div>
      <div class="qr">${qrSvg}</div>
      <div class="cap">Скануй → карта секонд-хендів<br><b>www.lvivsecondhand.com</b></div>
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:210mm; height:297mm; font-family:'DejaVu Sans',sans-serif; color:#14321f; }
  .sheet { width:210mm; height:297mm; display:grid;
           grid-template-columns:repeat(${COLS}, 1fr); grid-template-rows:repeat(${ROWS}, 1fr); }
  .cell { border:0.3mm dashed #c3d2c9; display:flex; align-items:center; justify-content:center; padding:2.5mm; }
  .sticker { width:100%; height:100%; border:1.2px solid #d7e2db; border-radius:4mm; background:#fff;
             display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2.5mm; text-align:center; }
  .top { font-size:7pt; font-weight:800; color:#1b5e38; margin-bottom:1.5mm; }
  .qr { width:26mm; height:26mm; }
  .qr svg { width:100%; height:100%; display:block; }
  .cap { font-size:6pt; color:#4b6b57; line-height:1.35; margin-top:1.5mm; }
  .cap b { color:#14321f; font-size:6.5pt; }
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
