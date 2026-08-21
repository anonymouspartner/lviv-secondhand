// Instagram profile photo. Instagram crops the avatar to a CIRCLE and renders it
// as small as 32px (comments, story ring), so this is not just the app icon
// re-exported: the square corners are unusable, and the mark has to survive at
// thumbnail size.
//
// Three things change versus icon-512.png:
//   - the hanger is scaled up (~46% → ~60% of the width) so it fills the circle
//     instead of floating in a square with dead corners;
//   - stroke weight scales with it, which is what keeps it legible at 32px;
//   - the ground is a radial gradient centred on the mark, so the circle crop
//     never clips a visible gradient seam.
//
// The geometry is the same vector as favicon.svg — not a raster upscale — so the
// curves stay crisp and the mark stays identical to the installed app icon.
// Run: `npm run avatar` → marketing/instagram/avatar-*.png + avatar-preview.png
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { C } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../marketing/instagram');
mkdirSync(outDir, { recursive: true });

const SIZE = 1080;

// favicon.svg's hanger, scaled about its own centre. stroke-width rides the
// transform, so the line weight grows with the mark rather than going spindly.
const hanger = (stroke, scale = 1.3) => `
  <g transform="translate(256,258) scale(${scale}) translate(-256,-258)"
     fill="none" stroke="${stroke}" stroke-width="26"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M256 214 L256 168 a30 26 0 1 1 32 26"/>
    <path d="M256 214 L138 316 a18 18 0 0 0 12 32 L362 348 a18 18 0 0 0 12 -32 Z"/>
  </g>`;

const VARIANTS = [
  {
    name: 'green',
    label: 'Classic — white on brand green',
    svg: `<defs><radialGradient id="g" cx="50%" cy="42%" r="72%">
            <stop offset="0" stop-color="#2f8f57"/><stop offset="1" stop-color="#10381f"/>
          </radialGradient></defs>
          <rect width="512" height="512" fill="url(#g)"/>
          ${hanger('#ffffff')}`,
  },
  {
    name: 'acid',
    label: 'Acid — brand yellow on deep ink',
    svg: `<defs><radialGradient id="g" cx="50%" cy="42%" r="72%">
            <stop offset="0" stop-color="#17693a"/><stop offset="1" stop-color="${C.ink}"/>
          </radialGradient></defs>
          <rect width="512" height="512" fill="url(#g)"/>
          ${hanger(C.acid)}`,
  },
  {
    name: 'paper',
    label: 'Paper — green on warm off-white',
    svg: `<rect width="512" height="512" fill="${C.paper}"/>
          ${hanger(C.green)}`,
  },
];

const svgDoc = (v) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${SIZE}" height="${SIZE}">${v.svg}</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

for (const v of VARIANTS) {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}</style></head>
     <body>${svgDoc(v)}</body></html>`,
    { waitUntil: 'networkidle' },
  );
  writeFileSync(resolve(outDir, `avatar-${v.name}.png`), await page.screenshot());
  await page.close();
}

// Contact sheet: each variant circle-cropped at the sizes Instagram actually
// uses, on both a light and a dark feed, because "does it still read at 32px"
// is the only question that decides this and it cannot be judged at 1080.
const shot = (v) => `
  <div class="col">
    <div class="lbl">${v.label}</div>
    <div class="row light">
      ${[320, 110, 32].map((px) => `<div class="av" style="width:${px}px;height:${px}px">${svgDoc(v).replace(`width="${SIZE}" height="${SIZE}"`, `width="${px}" height="${px}"`)}</div>`).join('')}
    </div>
    <div class="row dark">
      ${[320, 110, 32].map((px) => `<div class="av" style="width:${px}px;height:${px}px">${svgDoc(v).replace(`width="${SIZE}" height="${SIZE}"`, `width="${px}" height="${px}"`)}</div>`).join('')}
    </div>
  </div>`;

const page = await browser.newPage({ viewport: { width: 1240, height: 1500 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1240px;background:#f2f2f2;font:15px/1.4 system-ui,sans-serif;padding:34px;}
  h2{font-size:19px;margin-bottom:6px}
  .note{color:#666;font-size:14px;margin-bottom:24px}
  .col{margin-bottom:30px;background:#fff;border:1px solid #ddd;border-radius:14px;padding:20px;}
  .lbl{font-weight:600;margin-bottom:14px}
  .row{display:flex;align-items:center;gap:28px;padding:16px 20px;border-radius:10px;}
  .row.light{background:#fff;border:1px solid #eee;}
  .row.dark{background:#000;margin-top:10px;}
  .av{border-radius:50%;overflow:hidden;flex:none;}
  .av svg{display:block}
</style></head><body>
  <h2>Instagram profile photo — circle-cropped preview</h2>
  <div class="note">Each row: 320px (profile page) · 110px (feed/header) · 32px (comments, story ring). Light feed above, dark feed below.</div>
  ${VARIANTS.map(shot).join('')}
</body></html>`, { waitUntil: 'networkidle' });
writeFileSync(resolve(outDir, 'avatar-preview.png'), await page.screenshot({ fullPage: true }));
await page.close();

await browser.close();
console.log(`Wrote ${VARIANTS.length} avatars (${SIZE}×${SIZE}) + avatar-preview.png to marketing/instagram/`);
