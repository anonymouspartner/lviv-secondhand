// Lviv Second Hand — usage-metrics collector
//
// Receives anonymous, aggregate in-app events from the PWA and stores them in
// Cloudflare D1. It deliberately keeps NO personal data: no IP is stored, no
// user id, no coordinates, no free text — only a small enum of event types and
// short whitelisted keys (store ids, filter names, etc.).
//
// Deployed automatically by .github/workflows/deploy-worker.yml.

const ALLOWED_ORIGIN = 'https://anonymouspartner.github.io';
const TYPES = new Set(['store_open', 'filter', 'tab', 'lang', 'action']);
const LANGS = new Set(['en', 'ua']);
const MAX_BATCH = 20;
const MAX_BODY = 4096;

function cors() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function clean(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (request.method === 'GET') return new Response('ok', { status: 200, headers: cors() });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors() });

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return new Response('too large', { status: 413, headers: cors() });
      body = JSON.parse(text);
    } catch {
      return new Response('bad json', { status: 400, headers: cors() });
    }

    const items = Array.isArray(body && body.events) ? body.events : [body];
    const day = new Date().toISOString().slice(0, 10);
    const rows = [];
    for (const e of items.slice(0, MAX_BATCH)) {
      if (!e || !TYPES.has(e.type)) continue;                 // drop anything not in the enum
      rows.push({ type: e.type, key: clean(e.key, 40), lang: LANGS.has(e.lang) ? e.lang : null });
    }
    if (!rows.length) return new Response(null, { status: 204, headers: cors() });

    try {
      const stmt = env.DB.prepare('INSERT INTO events (day, type, key, lang) VALUES (?, ?, ?, ?)');
      await env.DB.batch(rows.map((r) => stmt.bind(day, r.type, r.key, r.lang)));
    } catch {
      return new Response('db error', { status: 500, headers: cors() });
    }
    return new Response(null, { status: 204, headers: cors() });
  },
};
