#!/usr/bin/env node
// Generate a static, crawlable page per store from stores.json, plus the
// /store/ index and the site sitemap.
//
// Why this exists: the app renders every store client-side on one URL, so
// search engines had a single page to rank for a site that is really about ~92
// distinct places. Someone googling a shop by name or street had nothing to
// match. These pages give each store its own URL, its own title/description,
// and LocalBusiness structured data.
//
// The output is committed to the repo — GitHub Pages serves this repo's root
// directly, so generated files ARE the deploy. That means they can drift from
// stores.json, which update-map.yml rewrites automatically. Two guards:
//   - ci.yml re-runs this and fails if the committed output differs
//   - update-map.yml re-runs it and commits the result with the data patch
// Run manually with:  node scripts/build-store-pages.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.lvivsecondhand.com';
const OUT_DIR = join(ROOT, 'store');

const DAYS = [
  ['mon', 'Понеділок', 'Monday'],
  ['tue', 'Вівторок', 'Tuesday'],
  ['wed', 'Середа', 'Wednesday'],
  ['thu', 'Четвер', 'Thursday'],
  ['fri', 'П’ятниця', 'Friday'],
  ['sat', 'Субота', 'Saturday'],
  ['sun', 'Неділя', 'Sunday'],
];
const SCHEMA_DAY = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const HOURS_RE = /^(\d{1,2}:\d{2})\s*[–\-—]\s*(\d{1,2}:\d{2})$/;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON-LD sits inside <script>, so the only sequence that can break out is
// "</script>". Escaping the slash keeps the JSON valid while making that
// impossible, whatever ends up in a store name or note.
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/');

const pricingLabel = (p) => p === 'kg'
  ? { ua: 'На вагу (ціна за кілограм)', en: 'By weight' }
  : { ua: 'Поштучно (ціна за річ)', en: 'Itemized' };

function parseHours(hours) {
  // Returns { known: bool, rows: [{label, value, open, close, closed}] }
  const rows = [];
  let known = false;
  for (const [key, ua] of DAYS) {
    const raw = String((hours || {})[key] ?? '?').trim();
    if (raw === 'closed') { rows.push({ key, ua, value: 'Зачинено', closed: true }); known = true; continue; }
    const m = HOURS_RE.exec(raw);
    if (m) { rows.push({ key, ua, value: `${m[1]}–${m[2]}`, open: m[1], close: m[2] }); known = true; continue; }
    rows.push({ key, ua, value: 'Невідомо', unknown: true });
  }
  return { known, rows };
}

// Only emit openingHoursSpecification for days we actually know. A guessed
// hour in structured data is worse than none — Google may surface it, and a
// shopper turns up at a closed door.
function hoursSchema(rows) {
  return rows
    .filter((r) => r.open && r.close)
    .map((r) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAY[r.key]}`,
      opens: r.open,
      closes: r.close,
    }));
}

// Latest published date not in the future, from a chain's own calendar.
function lastPublished(s, todayIso) {
  if (!Array.isArray(s.restockDates)) return null;
  for (let i = s.restockDates.length - 1; i >= 0; i--) {
    if (s.restockDates[i] <= todayIso) return s.restockDates[i];
  }
  return null;
}
function restockLine(s, todayIso) {
  const last = lastPublished(s, todayIso);
  if (last) return { ua: `Останнє завезення: ${last} (за офіційним календарем)`, has: true };
  if (Array.isArray(s.restockDates) && s.restockDates.length) {
    return { ua: `Наступне завезення: ${s.restockDates[0]} (за офіційним календарем)`, has: true };
  }
  if (s.restock_date) {
    return { ua: `Останнє завезення: ${s.restock_date}`, has: true };
  }
  if (s.restockDay) {
    const d = DAYS.find((x) => x[0] === s.restockDay);
    return { ua: `Завезення щотижня: ${d ? d[1].toLowerCase() : s.restockDay}`, has: true };
  }
  return { has: false };
}

function storePage(s, todayIso) {
  const { rows } = parseHours(s.hours);
  const price = pricingLabel(s.pricing);
  const addr = s.address || '';
  const restock = restockLine(s, todayIso);
  const cycleTxt = s.cycle > 0 ? `${s.cycle} дн.` : null;

  const title = `${s.name}${addr ? ` — ${addr}` : ''} · Секонд-хенд Львів`;
  const descParts = [
    `${s.name} — секонд-хенд у Львові`,
    addr ? `за адресою ${addr}` : null,
    `${price.ua.toLowerCase()}`,
    restock.has ? restock.ua.toLowerCase() : null,
  ].filter(Boolean);
  const description = `${descParts.join(', ')}. Години роботи, ціни та цикл знижок на карті секонд-хендів Львова.`;

  const url = `${ORIGIN}/store/${s.id}/`;
  const appUrl = `${ORIGIN}/?store=${encodeURIComponent(s.id)}`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

  // schema.org Store, a LocalBusiness subtype. Only fields we can back with
  // real data — no priceRange guess, no rating (there is no rating system).
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${url}#store`,
    name: s.name,
    url,
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(addr ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: addr,
        addressLocality: 'Львів',
        addressRegion: 'Львівська область',
        addressCountry: 'UA',
      },
    } : {}),
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
    ...(hoursSchema(rows).length ? { openingHoursSpecification: hoursSchema(rows) } : {}),
    isPartOf: { '@type': 'WebSite', '@id': `${ORIGIN}/#website` },
  };

  const hoursTable = rows.map((r) =>
    `      <tr><th scope="row">${esc(r.ua)}</th><td${r.unknown ? ' class="dim"' : ''}>${esc(r.value)}</td></tr>`
  ).join('\n');

  const facts = [
    addr ? `<tr><th scope="row">Адреса</th><td>${esc(addr)}${s.addressEn ? ` <span class="dim">· ${esc(s.addressEn)}</span>` : ''}</td></tr>` : '',
    s.phone ? `<tr><th scope="row">Телефон</th><td><a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></td></tr>` : '',
    `<tr><th scope="row">Тип цін</th><td>${esc(price.ua)}</td></tr>`,
    s.brand && s.brand !== 'Independent' ? `<tr><th scope="row">Мережа</th><td>${esc(s.brand)}</td></tr>` : '',
    restock.has ? `<tr><th scope="row">Завезення</th><td>${esc(restock.ua)}</td></tr>` : '',
    cycleTxt ? `<tr><th scope="row">Цикл знижок</th><td>${esc(cycleTxt)}</td></tr>` : '',
  ].filter(Boolean).join('\n      ');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#17693a">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lviv Second Hand">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta property="og:locale" content="uk_UA">
<link rel="icon" href="${ORIGIN}/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${ORIGIN}/apple-touch-icon.png">
<script type="application/ld+json">
${jsonLd(ld)}
</script>
<style>
:root{--paper:#f7f4ef;--ink:#14211a;--muted:#5d6b63;--green:#17693a;--line:#e2ddd4;--card:#fff}
@media(prefers-color-scheme:dark){:root{--paper:#0f1613;--ink:#e8efe9;--muted:#9aa9a0;--green:#4bbd7a;--line:#26332c;--card:#151f1a}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:24px 20px 56px}
a{color:var(--green)}
.crumb{font-size:13px;color:var(--muted);margin-bottom:18px}
.crumb a{color:var(--muted)}
h1{font-size:26px;line-height:1.25;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 22px;font-size:15px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0 0 22px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);font-size:15px;vertical-align:top}
tr:last-child th,tr:last-child td{border-bottom:0}
th{font-weight:600;width:44%;color:var(--muted)}
.dim{color:var(--muted)}
h2{font-size:17px;margin:26px 0 10px}
.cta{display:inline-block;background:var(--green);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;margin:0 8px 10px 0}
.cta.alt{background:transparent;color:var(--green);border:1px solid var(--green)}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--green);border-radius:10px;padding:12px 14px;color:var(--muted);font-size:14px}
footer{margin-top:34px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <nav class="crumb"><a href="${ORIGIN}/">Секонд-хенди Львова</a> › <a href="${ORIGIN}/store/">Усі магазини</a> › ${esc(s.name)}</nav>

  <h1>${esc(s.name)}</h1>
  <p class="sub">Секонд-хенд у Львові${addr ? ` · ${esc(addr)}` : ''}</p>

  <a class="cta" href="${esc(appUrl)}">Відкрити на карті</a>
  <a class="cta alt" href="${esc(mapsUrl)}" rel="noopener">Прокласти маршрут</a>

  <h2>Інформація</h2>
  <table>
    <tbody>
      ${facts}
    </tbody>
  </table>

  <h2>Години роботи</h2>
  <table>
    <tbody>
${hoursTable}
    </tbody>
  </table>
${Array.isArray(s.restockDates) && s.restockDates.length ? `
  <h2>Календар завезень ${esc(s.restockDates[0].slice(0, 4))}</h2>
  <p class="dim" style="font-size:14px;margin:-4px 0 10px;">Офіційний графік нових колекцій мережі.</p>
  <table>
    <tbody>
${s.restockDates.map((d) => `      <tr><th scope="row">${esc(d)}</th><td${d <= todayIso ? ' class="dim"' : ''}>${d <= todayIso ? 'вже було' : 'заплановано'}</td></tr>`).join('\n')}
    </tbody>
  </table>
` : ''}${s.note ? `
  <h2>Примітки</h2>
  <p class="note">${esc(s.note)}</p>
` : ''}
  <footer>
    Дані оновлюються спільнотою. Помітили помилку — виправте у
    <a href="${esc(appUrl)}">застосунку</a>.<br>
    <a href="${ORIGIN}/">← Усі секонд-хенди Львова на карті</a>
  </footer>
</div>
</body>
</html>
`;
}

function indexPage(stores) {
  const url = `${ORIGIN}/store/`;
  const title = 'Усі секонд-хенди Львова — список магазинів';
  const description = `Повний список секонд-хендів Львова (${stores.length} магазинів): адреси, години роботи, ціни на вагу та поштучно, дні завезення.`;
  const items = stores.map((s) => {
    const addr = s.address ? `<span class="dim"> — ${esc(s.address)}</span>` : '';
    return `      <li><a href="${ORIGIN}/store/${esc(s.id)}/">${esc(s.name)}</a>${addr}</li>`;
  }).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    numberOfItems: stores.length,
    itemListElement: stores.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${ORIGIN}/store/${s.id}/`,
      name: s.name,
    })),
  };

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#17693a">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lviv Second Hand">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta property="og:locale" content="uk_UA">
<link rel="icon" href="${ORIGIN}/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">
${jsonLd(ld)}
</script>
<style>
:root{--paper:#f7f4ef;--ink:#14211a;--muted:#5d6b63;--green:#17693a;--line:#e2ddd4;--card:#fff}
@media(prefers-color-scheme:dark){:root{--paper:#0f1613;--ink:#e8efe9;--muted:#9aa9a0;--green:#4bbd7a;--line:#26332c;--card:#151f1a}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:24px 20px 56px}
a{color:var(--green)}
.crumb{font-size:13px;color:var(--muted);margin-bottom:18px}
.crumb a{color:var(--muted)}
h1{font-size:26px;line-height:1.25;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 22px;font-size:15px}
ul{list-style:none;padding:0;margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
li{padding:11px 14px;border-bottom:1px solid var(--line);font-size:15px}
li:last-child{border-bottom:0}
.dim{color:var(--muted);font-size:14px}
.cta{display:inline-block;background:var(--green);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;margin:0 0 22px}
footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <nav class="crumb"><a href="${ORIGIN}/">Секонд-хенди Львова</a> › Усі магазини</nav>
  <h1>${esc(title)}</h1>
  <p class="sub">${stores.length} магазинів на карті Львова — адреси, години, ціни та дні завезення.</p>
  <a class="cta" href="${ORIGIN}/">Відкрити карту</a>
  <ul>
${items}
  </ul>
  <footer><a href="${ORIGIN}/">← На карту секонд-хендів Львова</a></footer>
</div>
</body>
</html>
`;
}

function sitemap(stores) {
  const staticUrls = [
    { loc: `${ORIGIN}/`, freq: 'daily', pri: '1.0' },
    { loc: `${ORIGIN}/store/`, freq: 'weekly', pri: '0.8' },
    { loc: `${ORIGIN}/jobs/`, freq: 'monthly', pri: '0.3' },
    { loc: `${ORIGIN}/privacy.html`, freq: 'yearly', pri: '0.1' },
  ];
  const entries = [
    ...staticUrls,
    ...stores.map((s) => ({ loc: `${ORIGIN}/store/${s.id}/`, freq: 'weekly', pri: '0.6' })),
  ];
  const body = entries.map((e) =>
    `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.freq}</changefreq>\n    <priority>${e.pri}</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Generated by scripts/build-store-pages.mjs — do not edit by hand.
  Re-run that script after changing stores.json (CI enforces this).
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ── main ────────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
const all = JSON.parse(readFileSync(join(ROOT, 'stores.json'), 'utf8'));
// Skip the dataset watermark exactly as the app's allStores() does. Publishing
// it would both expose the copyright trap and assert a store that isn't real.
const stores = all
  .filter((s) => !s.watermark)
  .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

// Rebuild from scratch so a store deleted from stores.json can't leave an
// orphan page serving a shop that no longer exists.
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const s of stores) {
  const dir = join(OUT_DIR, s.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), storePage(s, TODAY));
}
writeFileSync(join(OUT_DIR, 'index.html'), indexPage(stores));
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap(stores));

console.log(`Generated ${stores.length} store pages + /store/ index + sitemap.xml (${stores.length + 4} URLs).`);
