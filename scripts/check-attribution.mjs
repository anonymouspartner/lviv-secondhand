// Attribution check — every link we place elsewhere says where it was placed
// (?src=, docs/ATTRIBUTION.md), and none of that ever leaks into what Google
// crawls.
//
// Before this, 1,574 of 1,577 app opens in 30 days had no src: the app could
// read the tag, but almost nothing sent it, and the static store pages (where
// shared links and search results land) sent no metrics at all. So this pins
// both halves: the link builders (bot, channel, Instagram, QR, app share,
// PWA), and the receiving end (the store-page beacon, the Worker's page_view
// type and the owner's by-src stats), run against real code rather than read.
//   node --no-warnings scripts/check-attribution.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const srcOf = (u) => { try { return new URL(u).searchParams.get('src'); } catch { return null; } };

const A = await import('../shared/attribution.mjs');
const { SRC, withSrc, tagLinksInText, qrTag, qrLink } = A;

// ── the tag list ────────────────────────────────────────────────────────────
check(JSON.stringify(Object.keys(SRC)) === JSON.stringify(['tgch', 'tgbot', 'ig', 'share', 'pwa', 'twa', 'flyer', 'sticker', 'poster', 'sellsheet']), `SRC keys changed: ${Object.keys(SRC)}`);
for (const [k, v] of Object.entries(SRC)) {
  check(k === v && /^[a-z0-9-]{1,16}$/.test(v), `SRC.${k} = "${v}" is not a valid tag`);
  check(read('docs/ATTRIBUTION.md').includes('`' + v + '`'), `docs/ATTRIBUTION.md does not document "${v}"`);
}
// Every store id in every city must make a valid qr-<id> tag (≤16 chars).
for (const c of JSON.parse(read('cities.json'))) {
  for (const s of JSON.parse(read(c.stores))) {
    try { qrTag(s.id); } catch { check(false, `qr tag for ${c.slug} store "${s.id}" does not fit 16 chars of [a-z0-9-]`); }
  }
}

// ── the helpers ─────────────────────────────────────────────────────────────
check(withSrc('https://www.lvivsecondhand.com/', 'tgbot') === 'https://www.lvivsecondhand.com/?src=tgbot', 'withSrc on the root');
check(withSrc('https://www.lvivsecondhand.com/?store=c68', 'x1') === 'https://www.lvivsecondhand.com/?store=c68&src=x1', 'withSrc keeps existing params');
check(withSrc('https://kyiv.lvivsecondhand.com/?src=old#a', 'ig') === 'https://kyiv.lvivsecondhand.com/?src=ig#a', 'withSrc replaces src, keeps the fragment, works on city hosts');
for (const other of ['https://t.me/Secondhandlvivbot?start=x', 'mailto:hello@lvivsecondhand.com', 'tel:+380000', 'https://www.liqpay.ua/api/3/checkout', 'https://lviv-metrics.lshanalytic.workers.dev/billing?store=c1']) {
  check(withSrc(other, 'tgbot') === other, `withSrc must leave ${other} alone`);
}
let threw = false; try { withSrc('https://www.lvivsecondhand.com/', 'Bad Tag'); } catch { threw = true; }
check(threw, 'withSrc must refuse an invalid tag');
check(qrLink('c68') === 'https://www.lvivsecondhand.com/?store=c68&src=qr-c68', `qrLink(c68) = ${qrLink('c68')}`);
{
  const cap = 'Нове!\nКарта: www.lvivsecondhand.com\nhttps://www.lvivsecondhand.com/store/c68/?src=ig\nПишіть hello@lvivsecondhand.com.';
  const tg = tagLinksInText(cap, SRC.tgch, { bare: true });
  check(tg.includes('Карта: https://www.lvivsecondhand.com/?src=tgch'), `channel: bare mention not tagged: ${tg}`);
  check(tg.includes('https://www.lvivsecondhand.com/store/c68/?src=tgch'), 'channel: an ig tag must become tgch');
  check(tg.includes('hello@lvivsecondhand.com.'), 'channel: an email address must stay as it is');
  const ig = tagLinksInText(cap, SRC.ig);
  check(ig.includes('Карта: www.lvivsecondhand.com') && !ig.includes('?src=tgch'), 'instagram: bare mentions stay bare (not clickable there)');
}

// ── bot ─────────────────────────────────────────────────────────────────────
execFileSync(process.execPath, ['build-data.mjs'], { cwd: join(ROOT, 'telegram-bot'), stdio: 'ignore' });
const L = await import('../telegram-bot/links.mjs');
check(L.site() === 'https://www.lvivsecondhand.com/?src=tgbot', `bot site() = ${L.site()}`);
check(L.storeLink('c68') === 'https://www.lvivsecondhand.com/store/c68/?src=tgbot', `bot storeLink(c68) = ${L.storeLink('c68')}`);
check(L.storeLink('kv1') === 'https://www.lvivsecondhand.com/?store=kv1&src=tgbot', `bot storeLink(kv1) = ${L.storeLink('kv1')}`);
check(srcOf(L.site('?route=c1,c2')) === 'tgbot' && new URL(L.site('?route=c1,c2')).searchParams.get('route') === 'c1,c2', 'bot route link keeps its ids');
{
  // Static: every link to our site in the bot goes through site()/storeLink()/
  // qrLink(). The only raw uses allowed are files (print PDFs, the QR image).
  const bot = read('telegram-bot/worker.js').split('\n');
  bot.forEach((line, i) => {
    const code = line.replace(/^\s*\/\/.*$/, '');
    if (!/\$\{APP_URL\}|APP_URL \+|lvivsecondhand\.com\//.test(code)) return;
    const fileOnly = /APP_URL \+ 'marketing\/'|\/qr\.png`/.test(code);
    check(fileOnly, `telegram-bot/worker.js:${i + 1} builds a site link without site(): ${code.trim().slice(0, 120)}`);
  });
  // A URL that can carry two parameters has a raw "&" once tagged; inside an
  // HTML-mode message (every href here is one) it must go through esc().
  for (const [i, line] of bot.entries()) {
    for (const m of line.matchAll(/href="\$\{([^}]*)\}"/g)) {
      const expr = m[1];
      const multi = /storeLink|routeUrl|site\('\?/.test(expr);
      check(!multi || /^esc\(/.test(expr), `telegram-bot/worker.js:${i + 1} puts a multi-parameter URL in an href without esc(): ${expr}`);
    }
  }
}
// The metrics Worker's subscriber messages go out through the bot: tgbot.
{
  const w = read('worker/worker.js');
  check((w.match(/subscriberLink\(/g) || []).length >= 3, 'worker/worker.js: subscriber flash-deal/restock messages must use subscriberLink()');
  check(/const subscriberLink = \(link\) => withSrc\(link, SRC\.tgbot\)/.test(w), 'worker/worker.js: subscriberLink must tag tgbot');
}

// ── channel and Instagram ───────────────────────────────────────────────────
{
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/tag-caption.mjs'), 'tgch'], {
    input: 'Безкоштовно → https://www.lvivsecondhand.com\nhttps://www.lvivsecondhand.com/store/c1/?src=ig', encoding: 'utf8',
  });
  check(out === 'Безкоштовно → https://www.lvivsecondhand.com/?src=tgch\nhttps://www.lvivsecondhand.com/store/c1/?src=tgch', `tag-caption.mjs output: ${JSON.stringify(out)}`);
  const post = read('.github/workflows/telegram-channel-post.yml');
  check(/CAPTION="\$\(printf '%s' "\$CAPTION" \| node scripts\/tag-caption\.mjs tgch\)"/.test(post), 'telegram-channel-post.yml no longer tags the caption src=tgch before posting');
  const postStep = post.slice(post.indexOf('- name: Post to the channel'));
  check(postStep.indexOf('tag-caption.mjs') < postStep.indexOf('sendMessage'), 'telegram-channel-post.yml tags the caption after it is sent');
  check(/withSrc\(`https:\/\/\$\{SITE\}\/store\/\$\{storeId\}\/`, SRC\.ig\)/.test(read('tools/social/store-feature.mjs')), 'store-feature.mjs caption link must be src=ig');
  check(/withSrc\(process\.argv\[1\], SRC\.ig\)/.test(read('.github/workflows/instagram-ad.yml')), 'instagram-ad.yml caption link must be src=ig');
  check(/SRC\.tgch\)/.test(read('tools/social/restock-tomorrow.mjs')) && !/&src=tg`/.test(read('tools/social/restock-tomorrow.mjs')), 'restock-tomorrow.mjs must tag tgch');
}

// ── print materials (tools/social → marketing/*.pdf) ───────────────────────
// Each generic printout's QR carries its own tag. The PDFs are committed, so
// this checks the generator; the committed output was verified by decoding.
for (const [gen, env, tag] of [['flyer', 'FLYER_URL', 'flyer'], ['qr-stickers', 'STICKER_URL', 'sticker'], ['qr-poster', 'POSTER_URL', 'poster'], ['sell-sheet', 'SELLSHEET_URL', 'sellsheet']]) {
  const src = read(`tools/social/${gen}.mjs`);
  check(src.includes(`const URL_TARGET = withSrc(process.env.${env} || 'https://www.lvivsecondhand.com/', SRC.${tag});`), `tools/social/${gen}.mjs: its QR must be tagged src=${tag}`);
  check(/QRCode\.toString\(URL_TARGET,/.test(src), `tools/social/${gen}.mjs: the QR must encode URL_TARGET`);
}

// ── QR posters ──────────────────────────────────────────────────────────────
{
  const gen = read('scripts/build-qr-posters.mjs');
  check(!/\/\?store=\$\{/.test(gen), 'build-qr-posters.mjs builds a ?store= link without qrLink()');
  check((gen.match(/qrLink\(/g) || []).length >= 3, 'build-qr-posters.mjs: the poster, the sheet and qr.png must all use qrLink()');
  check(/esc\(qrLink\(store\.id\)\)/.test(read('telegram-bot/worker.js')), "the bot's QR 'Opens:' line must show qrLink()");
}

// ── app share buttons, PWA, Android ─────────────────────────────────────────
const home = read('index.html');
{
  check(new RegExp(`const SHARE_SRC = '${SRC.share}';`).test(home), "index.html SHARE_SRC must equal SRC.share");
  check(/const link = withShareSrc\(storeShareUrl\(id\)\);/.test(home), 'copyStoreLink must tag share');
  check(/const url = withShareSrc\(appUrl\(\)\);/.test(home), 'copyAppUrl must tag share');
  check(/qr\.addData\(withShareSrc\(appUrl\(\)\)\);/.test(home), 'the on-screen app QR must tag share');
  check(new RegExp(`visitSrc = '${SRC.twa}'`).test(home) && /LvivSecondHandApp/.test(read('native/capacitor.config.json')), 'Android app launches must be tagged twa from the LvivSecondHandApp user agent');
  const m = JSON.parse(read('manifest.webmanifest'));
  const base = 'https://www.lvivsecondhand.com/manifest.webmanifest';
  const start = new URL(m.start_url, base);
  check(start.searchParams.get('src') === SRC.pwa, `manifest start_url must carry src=pwa, is ${m.start_url}`);
  check(new URL(m.id, start.origin).href === 'https://www.lvivsecondhand.com/', `manifest id must stay the old resolved start_url "/", is ${m.id}`);
  check(start.href.startsWith(new URL(m.scope, base).href), 'start_url must stay within scope');
}

// ── never in what Google crawls ─────────────────────────────────────────────
{
  check(!/[?&]src=/.test(read('sitemap.xml')), 'sitemap.xml contains a ?src= URL');
  const SKIP = /^(scripts\/fixtures|marketing|tools|native|vendor)\//;
  const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
  for (const f of new Set([...pages, ...['store', 'chain'].flatMap((d) => readdirSync(join(ROOT, d)).map((x) => `${d}/${x}/index.html`)), 'store/index.html'])) {
    if (!existsSync(join(ROOT, f))) continue;
    const html = read(f).replace(/<script\b[\s\S]*?<\/script>/gi, '');
    for (const mm of html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/gi)) check(!/[?&]src=/.test(mm[1]), `${f}: canonical carries src: ${mm[1]}`);
    for (const mm of html.matchAll(/<meta\s+property="og:url"\s+content="([^"]*)"/gi)) check(!/[?&]src=/.test(mm[1]), `${f}: og:url carries src: ${mm[1]}`);
    for (const mm of html.matchAll(/\shref="([^"]*)"/gi)) check(!/[?&](amp;)?src=/.test(mm[1]), `${f}: static link carries src: ${mm[1]}`);
  }
}

// ── the store-page beacon ───────────────────────────────────────────────────
// Same METRICS_URL, sessionStorage key, sanitising and automated-browser test
// as index.html, so a store page and the app can never disagree.
const METRICS_URL = (home.match(/const METRICS_URL = '([^']+)'/) || [])[1];
const BOT_RE = '/bot|crawl|spider|headless|lighthouse|google-inspectiontool/i';
check(home.includes(`navigator.webdriver === true || ${BOT_RE}.test(navigator.userAgent)`), 'index.html IS_AUTOMATED must use the same test as the store pages');
check(/function track\(type, key\)\{\n  if \(!METRICS_URL \|\| IS_AUTOMATED\) return;/.test(home), 'index.html track() must skip automated browsers (IS_AUTOMATED)');
check(home.includes(".slice(0, 16).replace(/[^A-Za-z0-9_-]/g, '')") && home.includes("sessionStorage.setItem('lviv_sh_src', raw)"), 'index.html ?src= handling changed — update the store-page beacon to match');
function runBeacon(file, { search = '', webdriver = false, ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile', stored = null } = {}) {
  const html = read(file);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("type: 'page_view'"));
  if (!script) return null;
  const links = [...html.matchAll(/<a\b([^>]*)\sdata-map\s([^>]*)href="([^"]*)"/g)].map((m) => ({ href: m[3].replace(/&amp;/g, '&') }));
  const store = new Map(stored ? [['lviv_sh_src', stored]] : []);
  const beacons = [];
  let replaced = null;
  const ctx = {
    URL, URLSearchParams, JSON,
    location: { search, pathname: '/' + file.replace(/index\.html$/, ''), hash: '' },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    history: { replaceState: (_s, _t, u) => { replaced = u; } },
    document: { querySelectorAll: (sel) => (sel === 'a[data-map]' ? links : []) },
    navigator: { webdriver, userAgent: ua, sendBeacon: (u, b) => { beacons.push({ url: u, body: JSON.parse(b) }); return true; } },
    fetch: () => { throw new Error('fetch must not be needed when sendBeacon exists'); },
  };
  vm.runInNewContext(script, ctx);
  return { beacons, links, replaced, stored: store.get('lviv_sh_src') };
}
{
  const cases = [['store/c68/index.html', 'store:c68'], ['chain/humana/index.html', 'chain:humana'], ['store/index.html', 'store_index']];
  for (const [file, key] of cases) {
    const plain = runBeacon(file);
    check(plain, `${file}: no page_view beacon script`);
    if (!plain) continue;
    check(plain.beacons.length === 1, `${file}: ${plain.beacons.length} beacons per view, want 1`);
    const b = plain.beacons[0] || { body: {} };
    check(b.url === METRICS_URL, `${file}: beacon goes to ${b.url}, not index.html's METRICS_URL`);
    check(JSON.stringify(b.body) === JSON.stringify({ type: 'page_view', key, lang: 'ua', src: '' }), `${file}: beacon body ${JSON.stringify(b.body)}`);
    check(plain.links.length >= 1 && plain.links.every((l) => !srcOf(l.href)), `${file}: map links must be clean without a src`);

    const tagged = runBeacon(file, { search: '?src=tgch' });
    check(tagged.beacons[0] && tagged.beacons[0].body.src === 'tgch', `${file}: ?src=tgch not sent`);
    check(tagged.stored === 'tgch' && tagged.replaced === '/' + file.replace(/index\.html$/, ''), `${file}: src not kept in sessionStorage / stripped from the URL`);
    check(tagged.links.every((l) => srcOf(l.href) === 'tgch'), `${file}: map links did not get src=tgch: ${tagged.links.map((l) => l.href)}`);

    const dirty = runBeacon(file, { search: '?src=<x>"y' });
    check(dirty.beacons[0].body.src === 'xy', `${file}: src not sanitised like index.html: ${dirty.beacons[0].body.src}`);
    const later = runBeacon(file, { stored: 'qr-c68' });
    check(later.beacons[0].body.src === 'qr-c68', `${file}: src from earlier in the tab not sent`);

    check(runBeacon(file, { webdriver: true }).beacons.length === 0, `${file}: sends a beacon when navigator.webdriver is true`);
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 HeadlessChrome/130', 'Mozilla/5.0 Chrome-Lighthouse', 'Google-InspectionTool/1.0']) {
      check(runBeacon(file, { ua }).beacons.length === 0, `${file}: sends a beacon for automated UA "${ua}"`);
    }
  }
}

// ── the Worker: page_view accepted, visitors counted as before, stats by src ─
{
  const db = new DatabaseSync(':memory:');
  const norm = (a) => a.map((v) => (v === undefined ? null : v));
  const D1 = {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = norm(a); return this; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
    },
    async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
  };
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const worker = (await import('../worker/worker.js')).default;
  const env = { DB: D1, ADMIN_KEY: 'test-admin' };
  const beacon = (body, ip) => worker.fetch(new Request('https://lviv-metrics.lshanalytic.workers.dev/', {
    method: 'POST', body: JSON.stringify(body),
    headers: { Origin: 'https://www.lvivsecondhand.com', 'CF-Connecting-IP': ip, 'User-Agent': 'Mozilla/5.0' },
  }), env, { waitUntil() {} });
  const r1 = await beacon({ type: 'page_view', key: 'store:c68', lang: 'ua', src: 'tgch' }, '203.0.113.1');
  check(r1.status === 204, `page_view beacon: HTTP ${r1.status}`);
  await beacon({ type: 'action', key: 'app_open', lang: 'ua', src: 'tgch' }, '203.0.113.1');
  await beacon({ type: 'action', key: 'app_open', lang: 'en', src: '' }, '203.0.113.2');
  await beacon({ type: 'page_view', key: 'chain:humana', lang: 'ua', src: 'qr-c68' }, '203.0.113.3');
  await beacon({ type: 'not_a_type', key: 'x', lang: 'ua', src: 'tgch' }, '203.0.113.4');
  const ev = db.prepare('SELECT type, key, src FROM events ORDER BY rowid').all();
  check(ev.some((e) => e.type === 'page_view' && e.key === 'store:c68' && e.src === 'tgch'), `page_view row not stored: ${JSON.stringify(ev)}`);
  check(!ev.some((e) => e.type === 'not_a_type'), 'an unknown type must still be dropped');
  // Visitors: one per (day, ip, ua), whatever the beacon type — as before.
  // 203.0.113.4 sent only an unknown type, so it is not a visitor.
  const visits = db.prepare('SELECT COUNT(*) AS n FROM visits').get().n;
  check(visits === 3, `visitors counted ${visits}, want 3`);
  const stats = await (await worker.fetch(new Request('https://lviv-metrics.lshanalytic.workers.dev/api/stats?key=test-admin'), env, { waitUntil() {} })).json();
  const row = (rows, src) => (rows || []).find((r) => r.src === src) || {};
  for (const k of ['arrivalsBySrc7', 'arrivalsBySrc30']) {
    check(row(stats[k], 'tgch').opens === 1 && row(stats[k], 'tgch').views === 1, `${k} tgch: ${JSON.stringify(row(stats[k], 'tgch'))}`);
    check(row(stats[k], '(none)').opens === 1 && row(stats[k], '(none)').views === 0, `${k} (none): ${JSON.stringify(row(stats[k], '(none)'))}`);
    check(row(stats[k], 'qr-c68').views === 1, `${k} qr-c68: ${JSON.stringify(row(stats[k], 'qr-c68'))}`);
  }
  check(stats.last30 === 3, `/api/stats last30 = ${stats.last30}, want 3`);
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log('Attribution OK — bot/channel/Instagram/QR/share/PWA/Android links tagged, nothing tagged in what Google crawls, store-page beacon matches the app and skips automated browsers, the Worker takes page_view and reports arrivals by src.');
