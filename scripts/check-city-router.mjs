// City-router SEO check — drives city-router/worker.js against the repo's own
// HTML (standing in for www) and asserts what a crawler of a city host reads.
//
// The bug this pins: the Worker proxied www byte-for-byte, so every city
// homepage shipped www's static canonical and Google filed all ten as
// duplicates of Lviv ("Alternate page with proper canonical tag"); and pages
// with no canonical at all existed on 11 hosts with nothing to pick between
// them ("Duplicate without user-selected canonical"). index.html's JavaScript
// rewrite of the canonical did not help — Google uses the raw HTML value.
//
// It also checks that every site page carries exactly one static canonical, so
// a new page can't reintroduce the second failure.
//
// Node has no HTMLRewriter (it is a Workers runtime API), so a minimal one is
// defined below covering exactly what the Worker uses: attribute selectors,
// getAttribute/setAttribute and an end-tag insert. If the Worker starts using
// more of the API, the stand-in throws instead of silently passing.
//   node scripts/check-city-router.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// ── HTMLRewriter stand-in ────────────────────────────────────────────────────
if (typeof globalThis.HTMLRewriter === 'undefined') {
  const parseSel = (sel) => {
    const m = sel.match(/^([a-z]+)(?:\[([a-z:-]+)="([^"]*)"\])?$/);
    if (!m) throw new Error(`HTMLRewriter stand-in: unsupported selector ${sel}`);
    return { tag: m[1], attr: m[2], val: m[3] };
  };
  const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  globalThis.HTMLRewriter = class {
    constructor() { this.rules = []; }
    on(sel, handlers) {
      for (const k of Object.keys(handlers)) if (k !== 'element') throw new Error(`HTMLRewriter stand-in: unsupported handler ${k}`);
      this.rules.push({ sel: parseSel(sel), handlers });
      return this;
    }
    transform(res) {
      const rules = this.rules;
      const body = res.body ? res.text().then((html) => {
        let out = '';
        let last = 0;
        const pendingEnd = []; // { tag, fns }
        // Skip comments and script/style bodies so markup inside them isn't matched.
        const TOK = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
        for (let m; (m = TOK.exec(html));) {
          if (!m[3]) continue;
          const closing = m[2] === '/';
          const tag = m[3].toLowerCase();
          if (closing) {
            const i = pendingEnd.findIndex((p) => p.tag === tag);
            if (i < 0) continue;
            const { fns } = pendingEnd.splice(i, 1)[0];
            let before = '';
            for (const fn of fns) fn({ before(h, o) { if (!o || !o.html) throw new Error('stand-in: text insert unsupported'); before += h; } });
            out += html.slice(last, m.index) + before;
            last = m.index;
            continue;
          }
          const attrs = new Map();
          for (const a of m[4].matchAll(ATTR_RE)) attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
          let changed = false;
          const endFns = [];
          for (const { sel, handlers } of rules) {
            if (sel.tag !== tag || (sel.attr && attrs.get(sel.attr) !== sel.val)) continue;
            handlers.element({
              getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
              setAttribute: (n, v) => { attrs.set(n, v); changed = true; },
              onEndTag: (fn) => endFns.push(fn),
            });
          }
          if (endFns.length) pendingEnd.push({ tag, fns: endFns });
          if (changed) {
            const a = [...attrs].map(([k, v]) => `${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join(' ');
            out += html.slice(last, m.index) + `<${m[3]} ${a}>`;
            last = m.index + m[0].length;
          }
        }
        return out + html.slice(last);
      }) : null;
      const headers = new Headers(res.headers);
      headers.delete('content-length');
      return body
        ? body.then((b) => new Response(b, { status: res.status, statusText: res.statusText, headers }))
        : new Response(null, { status: res.status, statusText: res.statusText, headers });
    }
  };
}

// ── www, served from the repo ───────────────────────────────────────────────
let upstreamCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const req = input instanceof Request ? input : new Request(input);
  const u = new URL(req.url);
  upstreamCalls.push(u.href);
  if (u.host !== 'www.lvivsecondhand.com') {
    return new Response(`passthrough:${u.href}`, { headers: { 'content-type': 'text/html', 'x-passthrough': '1' } });
  }
  if (u.pathname === '/store') return new Response(null, { status: 301, headers: { location: 'https://www.lvivsecondhand.com/store/' } });
  let f = u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname;
  f = join(ROOT, f);
  if (!existsSync(f)) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
  const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.txt') ? 'text/plain; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  const buf = readFileSync(f);
  return new Response(req.method === 'HEAD' ? null : buf, { headers: { 'content-type': type, 'content-length': String(buf.length), etag: '"www"' } });
};
const worker = (await import('../city-router/worker.js')).default;
const get = async (href, method = 'GET') => {
  const res = await worker.fetch(new Request(href, { method }));
  return { res, text: method === 'HEAD' ? '' : await res.text() };
};
const canonicals = (html) => [...html.replace(/<script\b[\s\S]*?<\/script>/gi, '').matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"\s*\/?>/gi)].map((m) => m[1]);
const ogUrl = (html) => (html.match(/<meta\s+property="og:url"\s+content="([^"]*)"/i) || [])[1];

// City homepage: self-canonical, matching og:url, no www canonical left.
for (const path of ['/', '/index.html', '/?lang=en']) {
  const { res, text } = await get(`https://kyiv.lvivsecondhand.com${path}`);
  const c = canonicals(text);
  check(res.status === 200, `kyiv ${path}: status ${res.status}`);
  check(c.length === 1 && c[0] === 'https://kyiv.lvivsecondhand.com/', `kyiv ${path}: canonical is ${JSON.stringify(c)}, want the kyiv root`);
  check(ogUrl(text) === 'https://kyiv.lvivsecondhand.com/', `kyiv ${path}: og:url is ${ogUrl(text)}`);
  check(res.headers.get('x-city-router') === 'kyiv', `kyiv ${path}: x-city-router header missing`);
}
{
  const { text } = await get('https://ivano-frankivsk.lvivsecondhand.com/');
  check(canonicals(text)[0] === 'https://ivano-frankivsk.lvivsecondhand.com/', 'ivano-frankivsk /: canonical not self');
}

// Pages with no canonical of their own get the www one, exactly once. The repo
// copies now carry it statically; strip it to prove the Worker adds it too.
for (const [path, want] of [['/offer.html', '/offer.html'], ['/privacy.html', '/privacy.html'], ['/jobs/', '/jobs/']]) {
  const { text } = await get(`https://kyiv.lvivsecondhand.com${path}`);
  const c = canonicals(text);
  check(c.length === 1 && c[0] === `https://www.lvivsecondhand.com${want}`, `kyiv ${path}: canonical is ${JSON.stringify(c)}`);
}
{
  const saved = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const r = await saved(input);
    const html = (await r.text()).replace(/<link rel="canonical"[^>]*>\n?/g, '');
    return new Response(html, { status: r.status, headers: r.headers });
  };
  for (const [path, want] of [['/offer.html', '/offer.html'], ['/jobs/', '/jobs/'], ['/jobs/index.html', '/jobs/']]) {
    const { text } = await get(`https://kyiv.lvivsecondhand.com${path}`);
    const c = canonicals(text);
    check(c.length === 1 && c[0] === `https://www.lvivsecondhand.com${want}`, `kyiv ${path} (no static canonical): Worker gave ${JSON.stringify(c)}`);
    check(/<link rel="canonical" href="[^"]+">\s*<\/head>/.test(text), `kyiv ${path}: appended canonical is not inside <head>`);
  }
  globalThis.fetch = saved;
}

// Lviv-only pages keep their www canonical.
for (const path of ['/store/c68/', '/contacts.html', '/services.html']) {
  const { text } = await get(`https://kharkiv.lvivsecondhand.com${path}`);
  const c = canonicals(text);
  check(c.length === 1 && c[0] === `https://www.lvivsecondhand.com${path}`, `kharkiv ${path}: canonical is ${JSON.stringify(c)}`);
}

// Lviv's store and chain pages are noindex on city hosts (canonical kept), and
// nowhere else: not on www, not on a city homepage, not on the shared pages.
const robotsMeta = (html) => [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]*)"\s*\/?>/gi)].map((m) => m[1]);
for (const path of ['/store/c68/', '/chain/humana/', '/store/']) {
  const { text } = await get(`https://kyiv.lvivsecondhand.com${path}`);
  const r = robotsMeta(text);
  check(r.length === 1 && r[0] === 'noindex, follow', `kyiv ${path}: robots meta is ${JSON.stringify(r)}, want one "noindex, follow"`);
  check(/<meta name="robots" content="noindex, follow">\s*<\/head>/.test(text), `kyiv ${path}: robots meta is not inside <head>`);
  check(canonicals(text)[0] === `https://www.lvivsecondhand.com${path}`, `kyiv ${path}: canonical changed`);
}
for (const href of ['https://www.lvivsecondhand.com/store/c68/', 'https://www.lvivsecondhand.com/chain/humana/', 'https://kyiv.lvivsecondhand.com/', 'https://kyiv.lvivsecondhand.com/offer.html', 'https://kyiv.lvivsecondhand.com/contacts.html']) {
  const { text } = await get(href);
  check(robotsMeta(text).length === 0, `${href}: has a robots meta ${JSON.stringify(robotsMeta(text))}, want none`);
}

// Per-host sitemap: one <loc>, the city root.
{
  upstreamCalls = [];
  const { res, text } = await get('https://kyiv.lvivsecondhand.com/sitemap.xml');
  const locs = [...text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  check(res.status === 200 && (res.headers.get('content-type') || '').includes('xml'), 'kyiv /sitemap.xml: not served as XML');
  check(locs.length === 1 && locs[0] === 'https://kyiv.lvivsecondhand.com/', `kyiv /sitemap.xml: locs ${JSON.stringify(locs)}`);
  check(upstreamCalls.length === 0, 'kyiv /sitemap.xml: should not fetch www');
}

// robots.txt: www's rules, this host's sitemap.
{
  const www = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  const { text } = await get('https://odesa.lvivsecondhand.com/robots.txt');
  check(/^Sitemap: https:\/\/odesa\.lvivsecondhand\.com\/sitemap\.xml$/m.test(text), 'odesa /robots.txt: Sitemap line not rewritten');
  check(!text.includes('www.lvivsecondhand.com/sitemap.xml'), 'odesa /robots.txt: still names the www sitemap');
  check(text.replace(/^Sitemap:.*$/gm, '') === www.replace(/^Sitemap:.*$/gm, ''), 'odesa /robots.txt: rules differ from www');
  // The API-path rules that stop Google crawling 404s built from the inline
  // script must reach every city host too, not just www.
  for (const path of ['/api/', '/cdn-cgi/', '/promote', '/flash-deal', '/order', '/subscribe', '/unsubscribe', '/status', '/promos', '/chain-prices', '/test-push']) {
    check(text.split('\n').includes(`Disallow: ${path}`), `odesa /robots.txt: missing "Disallow: ${path}"`);
  }
}

// Untouched: non-HTML, HEAD, redirects (still moved onto the city host), and
// every host that isn't a city.
{
  const json = readFileSync(join(ROOT, 'stores.json'), 'utf8');
  const { text } = await get('https://kyiv.lvivsecondhand.com/stores.json');
  check(text === json, 'kyiv /stores.json: body changed');
  const head = await get('https://kyiv.lvivsecondhand.com/', 'HEAD');
  check(head.res.status === 200, 'kyiv HEAD /: failed');
  const redir = await get('https://kyiv.lvivsecondhand.com/store');
  check(redir.res.status === 301 && redir.res.headers.get('location') === 'https://kyiv.lvivsecondhand.com/store/', `kyiv /store: redirect location ${redir.res.headers.get('location')}`);
  for (const href of ['https://sibling.lvivsecondhand.com/x', 'https://lvivsecondhand.com/']) {
    const { res, text: t } = await get(href);
    check(res.headers.get('x-passthrough') === '1' && t === `passthrough:${href}`, `${href}: not passed through untouched`);
  }
}
globalThis.fetch = realFetch;

// Every site page has exactly one static canonical, outside any <script>.
const SKIP = /^(scripts\/fixtures|marketing|qr|tools|native|vendor)\//;
const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
for (const f of pages) {
  const n = canonicals(readFileSync(join(ROOT, f), 'utf8')).length;
  check(n === 1, `${f}: ${n} static canonical tags (want exactly 1)`);
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`City router OK — self-canonical city homepages, www canonical on every other page, per-host robots.txt and sitemap, ${pages.length} site pages with one canonical each.`);
