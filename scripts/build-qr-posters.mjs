#!/usr/bin/env node
// Generate a printable QR poster per store, plus a bulk contact sheet.
//
// Each poster encodes the store's own deep link (…/?store=<id>), so a shopper
// scanning it in the shop lands on that shop's page in the app rather than the
// generic map. The owner prints these and the field agent places them — that's
// the ₴200 poster bonus in docs/FIELD_AGENT.md.
//
// Design is one generic template tinted from a fixed palette, so the set looks
// varied on a table but stays recognisably one brand.
//
// The QR modules themselves are drawn in a DARK tint only. Light or mid-tone
// modules look better on screen but drop the luminance contrast the decoder
// needs, and these get printed on cheap paper and scanned in dim shop lighting
// — so colour goes in the frame, never in the code's contrast budget.
//
// Output is committed (Pages serves the repo root). ci.yml regenerates and
// fails on drift; update-map.yml rebuilds on every data patch, since a store
// rename has to reach the poster too.
// Run manually with:  node scripts/build-qr-posters.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const qrcode = require(join(ROOT, 'vendor/qrcode.js'));

const ORIGIN = 'https://www.lvivsecondhand.com';
const OUT_DIR = join(ROOT, 'qr');

// [dark — used for QR modules and text, bright — used for the header band]
const PALETTE = [
  ['#17693a', '#2fae68', 'Ліс'],
  ['#8e1d4d', '#d4487f', 'Ягода'],
  ['#26358c', '#5a70dd', 'Індиго'],
  ['#9c3d10', '#e2761f', 'Мідь'],
  ['#0f5f63', '#19a6ad', 'Бірюза'],
  ['#5b2478', '#9a4fc9', 'Слива'],
  ['#8f1d24', '#d94450', 'Гранат'],
  ['#4a5a15', '#8fa62c', 'Олива'],
];

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Deterministic colour per store, so a reprint of one poster always matches the
// one already hanging in that shop.
function paletteFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Build the SVG from the module matrix rather than the library's createSvgTag,
// which hardcodes black. One <path> for all dark modules keeps the file small.
function qrSvg(text, dark, px) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;                 // spec-required quiet zone, in modules
  const total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" `
    + `width="${px}" height="${px}" shape-rendering="crispEdges" role="img" `
    + `aria-label="QR"><rect width="${total}" height="${total}" fill="#fff"/>`
    + `<path d="${d}" fill="${dark}"/></svg>`;
}

// ── Minimal PNG writer ──────────────────────────────────────────────────────
// Telegram's sendPhoto needs a real raster image, not the SVG the posters use,
// and this repo deliberately has no npm dependencies. PNG is simple enough to
// emit directly: signature + IHDR + IDAT (zlib, which Node ships) + IEND.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgb) {
  // rgb: Buffer of width*height*3. Prefix each scanline with filter type 0.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type 2 = truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// The image Telegram sends to an agent. Same colour and quiet zone as the
// printed poster, so what arrives in chat is the poster's code, not a variant.
function qrPng(text, dark, scale = 16) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const side = (n + quiet * 2) * scale;
  const [dr, dg, db] = hexRgb(dark);
  const rgb = Buffer.alloc(side * side * 3, 0xff);   // white ground
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      const x0 = (c + quiet) * scale, y0 = (r + quiet) * scale;
      for (let y = y0; y < y0 + scale; y++) {
        let p = (y * side + x0) * 3;
        for (let x = 0; x < scale; x++) { rgb[p++] = dr; rgb[p++] = dg; rgb[p++] = db; }
      }
    }
  }
  return encodePng(side, side, rgb);
}

const CSS = (dark, bright) => `
:root{--dark:${dark};--bright:${bright}}
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#eceae5;color:#14211a;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.card{width:148mm;height:210mm;background:#fff;display:flex;flex-direction:column;
  box-shadow:0 6px 28px rgba(0,0,0,.16);overflow:hidden}
.band{background:var(--bright);color:#fff;padding:13mm 10mm 9mm;text-align:center}
.kicker{font-size:11pt;letter-spacing:.14em;text-transform:uppercase;opacity:.92;font-weight:700}
.store{font-size:26pt;font-weight:800;line-height:1.12;margin-top:3mm;letter-spacing:-.01em}
/* The store id, not its name — the poster stays generic, and this is what the
   owner matches against the print index when handing posters to an agent. */
.code{display:inline-block;margin-top:5mm;padding:1.6mm 4.5mm;border:0.6mm solid rgba(255,255,255,.75);
  border-radius:99px;font-size:11pt;font-weight:800;letter-spacing:.12em;font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}
.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8mm}
.qr{border:2mm solid var(--dark);border-radius:3mm;line-height:0;background:#fff}
.qr svg{display:block;width:74mm;height:74mm}
.cta{font-size:15pt;font-weight:800;color:var(--dark);text-align:center;margin-top:7mm;line-height:1.3}
.sub{font-size:10.5pt;color:#5d6b63;text-align:center;margin-top:3mm;max-width:110mm}
.foot{background:var(--dark);color:#fff;text-align:center;padding:5mm;font-size:11pt;font-weight:700;letter-spacing:.02em}
@page{size:A5 portrait;margin:0}
@media print{
  body{background:#fff;padding:0;display:block;min-height:0}
  .card{width:148mm;height:210mm;box-shadow:none}
  .noprint{display:none}
}
.noprint{position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#14211a;color:#fff;
  padding:8px 16px;border-radius:20px;font-size:13px;z-index:9}
.noprint a{color:#7fd6a3}
`;

function poster(s) {
  const [dark, bright] = paletteFor(s.id);
  const link = `${ORIGIN}/?store=${encodeURIComponent(s.id)}`;
  const svg = qrSvg(link, dark, 280);
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<!-- Title carries the id, not the store name: browsers print the page title in
     the sheet header by default, so a name here would end up on the poster. -->
<title>QR ${esc(s.id.toUpperCase())}</title>
<style>${CSS(dark, bright)}</style>
</head>
<body>
<div class="noprint">Ctrl/⌘+P → друк A5 · <a href="${ORIGIN}/qr/">усі плакати</a></div>
<div class="card">
  <div class="band">
    <div class="kicker">Безкоштовна карта</div>
    <div class="store">Секонд-хенди<br>Львова</div>
    <div class="code">${esc(s.id.toUpperCase())}</div>
  </div>
  <div class="mid">
    <div class="qr">${svg}</div>
    <div class="cta">Скануй — дізнайся,<br>коли завезення і які ціни</div>
    <div class="sub">Безкоштовний застосунок: адреси, години роботи й дні завезення — щоб знати, коли йти.</div>
  </div>
  <div class="foot">www.lvivsecondhand.com</div>
</div>
</body>
</html>
`;
}

// Bulk sheet — 92 separate A5 print jobs is not a realistic errand, so this
// puts every store on A4 pages, 8 up, for one print run and a paper trimmer.
function sheet(stores) {
  const cells = stores.map((s) => {
    const [dark, bright] = paletteFor(s.id);
    const link = `${ORIGIN}/?store=${encodeURIComponent(s.id)}`;
    // Store id only — no name, no address. It is also the thing that actually
    // disambiguates: several shops share a name ("Євро секонд хенд" ×3), so the
    // id is what lets the agent match a cut-out sticker back to a door via the
    // print index.
    return `  <div class="cell" style="--dark:${dark};--bright:${bright}">
    <div class="ct">
      <div class="ch">Секонд-хенди Львова</div>
      <div class="ca">${esc(s.id.toUpperCase())}</div>
    </div>
    <div class="cq">${qrSvg(link, dark, 150)}</div>
    <div class="cf">www.lvivsecondhand.com</div>
  </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>QR-наліпки — усі магазини</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#eceae5;color:#14211a;padding:14px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0;max-width:210mm;margin:0 auto;background:#fff}
.cell{border:1px dashed #bdb8ae;padding:5mm 4mm;text-align:center;display:flex;flex-direction:column;
  align-items:center;justify-content:space-between;height:70mm;break-inside:avoid}
.ct{min-height:13mm;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ch{font-size:9.5pt;font-weight:800;color:var(--dark);line-height:1.2}
.ca{font-size:9pt;font-weight:800;color:#5d6b63;letter-spacing:.1em;margin-top:1.5mm;
  font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}
.cq{line-height:0;border:1.2mm solid var(--dark);border-radius:2mm;background:#fff}
.cq svg{display:block;width:33mm;height:33mm}
.cf{font-size:7pt;color:#5d6b63;font-weight:600}
.noprint{text-align:center;margin:0 auto 12px;max-width:210mm;background:#14211a;color:#fff;padding:8px;border-radius:8px;font-size:13px}
.noprint a{color:#7fd6a3}
@page{size:A4 portrait;margin:8mm}
@media print{body{background:#fff;padding:0}.noprint{display:none}.grid{max-width:none}}
</style>
</head>
<body>
<div class="noprint">Ctrl/⌘+P → друк A4, ${stores.length} наліпок · <a href="${ORIGIN}/qr/">назад</a></div>
<div class="grid">
${cells}
</div>
</body>
</html>
`;
}

function index(stores) {
  const rows = stores.map((s) => {
    const [dark, bright] = paletteFor(s.id);
    return `    <li><span class="dot" style="background:${bright}"></span>`
      + `<a href="${ORIGIN}/qr/${esc(s.id)}/">${esc(s.name)}</a>`
      + `${s.address ? `<span class="dim"> — ${esc(s.address)}</span>` : ''}</li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>QR-плакати для магазинів</title>
<style>
:root{--paper:#f7f4ef;--ink:#14211a;--muted:#5d6b63;--green:#17693a;--line:#e2ddd4;--card:#fff}
@media(prefers-color-scheme:dark){:root{--paper:#0f1613;--ink:#e8efe9;--muted:#9aa9a0;--green:#4bbd7a;--line:#26332c;--card:#151f1a}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:24px 20px 56px}
a{color:var(--green)}
h1{font-size:24px;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 20px;font-size:15px}
.cta{display:inline-block;background:var(--green);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;margin:0 8px 18px 0}
ul{list-style:none;padding:0;margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
li{padding:10px 14px;border-bottom:1px solid var(--line);font-size:15px;display:flex;align-items:center;gap:9px}
li:last-child{border-bottom:0}
.dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto}
.dim{color:var(--muted);font-size:14px}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--green);border-radius:10px;padding:12px 14px;color:var(--muted);font-size:14px;margin:0 0 20px}
</style>
</head>
<body>
<div class="wrap">
  <h1>QR-плакати для магазинів</h1>
  <p class="sub">${stores.length} плакатів — кожен веде на сторінку свого магазину в застосунку.</p>
  <p class="note">Відкрий плакат і надрукуй (Ctrl/⌘+P), формат A5. Або надрукуй <b>усі одразу</b> аркушами A4 і розріж.</p>
  <a class="cta" href="${ORIGIN}/qr/sheet/">🖨️ Друкувати всі (A4)</a>
  <ul>
${rows}
  </ul>
</div>
</body>
</html>
`;
}

// ── main ────────────────────────────────────────────────────────────────────
const all = JSON.parse(readFileSync(join(ROOT, 'stores.json'), 'utf8'));
const stores = all
  .filter((s) => !s.watermark)   // never print the dataset watermark
  .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const s of stores) {
  mkdirSync(join(OUT_DIR, s.id), { recursive: true });
  writeFileSync(join(OUT_DIR, s.id, 'index.html'), poster(s));
  // qr.png is what the Telegram bot sends for `/materials <id>` — sendPhoto
  // takes a URL, so the image has to exist as a static file.
  const [dark] = paletteFor(s.id);
  writeFileSync(join(OUT_DIR, s.id, 'qr.png'), qrPng(`${ORIGIN}/?store=${encodeURIComponent(s.id)}`, dark));
}
mkdirSync(join(OUT_DIR, 'sheet'), { recursive: true });
writeFileSync(join(OUT_DIR, 'sheet', 'index.html'), sheet(stores));
writeFileSync(join(OUT_DIR, 'index.html'), index(stores));

console.log(`Generated ${stores.length} QR posters (+ qr.png each) + bulk sheet + index.`);
