// Renders the social share-preview image (Open Graph / Twitter) to og-image.png
// at the repo root. Run: `npm run og` in tools/social (see README.md).
//
// 1200×630 is the canonical OG size (also the 1.91:1 ratio Twitter/Facebook use).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');
const out = resolve(repoRoot, 'og-image.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; font-family:'DejaVu Sans',sans-serif; }
  .card {
    width:1200px; height:630px; position:relative; overflow:hidden;
    background:linear-gradient(145deg,#1b5e38 0%,#0f3d24 100%);
    display:flex; align-items:center; padding:0 84px; color:#fff;
  }
  /* faint map-grid texture */
  .card::before {
    content:""; position:absolute; inset:0; opacity:.06;
    background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:64px 64px;
  }
  .txt { position:relative; flex:1; }
  .kicker { font-size:26px; font-weight:700; letter-spacing:.22em; color:#a7e3c1; text-transform:uppercase; margin-bottom:22px; }
  h1 { font-size:96px; font-weight:700; line-height:1; letter-spacing:-1px; }
  .en { font-size:38px; font-weight:700; margin-top:28px; color:rgba(255,255,255,.96); }
  .ua { font-size:32px; margin-top:12px; color:rgba(255,255,255,.72); }
  .url {
    display:inline-block; margin-top:40px; font-size:28px; font-weight:700;
    background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.25);
    padding:14px 26px; border-radius:999px; letter-spacing:.02em;
  }
  .icon { position:relative; width:340px; height:340px; flex:none; margin-left:40px;
          filter:drop-shadow(0 24px 48px rgba(0,0,0,.35)); }
  .icon img { width:100%; height:100%; border-radius:64px; }
</style></head><body>
  <div class="card">
    <div class="txt">
      <div class="kicker">Львів · Second-hand</div>
      <h1>Lviv Second Hand</h1>
      <div class="en">Find &amp; track every second-hand store in Lviv</div>
      <div class="ua">Карта, години роботи та дні завезення</div>
      <span class="url">www.lvivsecondhand.com</span>
    </div>
    <div class="icon"><img src="data:image/png;base64,${iconB64}"/></div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
const buf = await page.locator('.card').screenshot();
writeFileSync(out, buf);
await browser.close();
console.log('Wrote', out, buf.length, 'bytes');
