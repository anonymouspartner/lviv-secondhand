// Lviv Second Hand — collector + push Worker
//
// Two jobs, both anonymous and free-tier:
//  1. Usage metrics  — POST / with {type,key,lang}; stored in D1 (no personal data).
//  2. Restock push   — POST /subscribe · /unsubscribe manage Web Push subscriptions
//     (device endpoint + followed stores, each with a predicted next-restock
//     date = last delivery + cycle); a daily cron pushes when that date arrives
//     and rolls it forward by the cycle.
//
// Web Push (VAPID + RFC 8291 aes128gcm) is implemented with Web Crypto — no deps.
// Deployed by .github/workflows/deploy-worker.yml. Secrets: VAPID_PRIVATE.

const ALLOWED_ORIGIN = 'https://anonymouspartner.github.io';
const TYPES = new Set(['store_open', 'filter', 'tab', 'lang', 'action']);
const LANGS = new Set(['en', 'ua']);
const MAX_BATCH = 20;
const MAX_BODY = 8192;
const VAPID_SUBJECT = 'mailto:lviv.secondhand@example.com';
// Each follow carries the store's predicted next restock date + cycle + name
// (client computes next = last delivery date + inventory cycle). The cron fires
// on/after that date, then rolls it forward by the cycle. No server-side schedule.
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function kyivDateStr() {
  // 'YYYY-MM-DD' for "today" in Europe/Kyiv (en-CA yields ISO order).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

function cors() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(obj, status) { return new Response(obj == null ? null : JSON.stringify(obj), { status: status || 200, headers: { ...cors(), 'Content-Type': 'application/json' } }); }
function clean(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

let _schemaReady = false;
async function ensureSchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, stores TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL DEFAULT (datetime('now')))"
  ).run();
  _schemaReady = true;
}

// ── byte helpers ──
function b64uToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  s += '='.repeat(pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(buf) {
  const a = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  let len = 0; for (const a of arrs) len += a.length;
  const out = new Uint8Array(len); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

// ── VAPID (RFC 8292) ──
async function vapidJwt(endpoint, env) {
  const pub = b64uToBytes(env.VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o) => bytesToB64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT });
  const signingInput = head + '.' + body;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return signingInput + '.' + bytesToB64u(sig);
}

// ── Payload encryption (RFC 8291 / aes128gcm) ──
async function encryptPayload(p256dh, authSecretB64, plaintext) {
  const uaPublic = b64uToBytes(p256dh);       // 65 bytes
  const authSecret = b64uToBytes(authSecretB64);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey)); // 65 bytes
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const keyInfo = concat(new TextEncoder().encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(new TextEncoder().encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(new TextEncoder().encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const record = concat(plaintext, new Uint8Array([2])); // 0x02 = last-record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false); // record size
  header[20] = asPublic.length;                           // keyid length (65)
  header.set(asPublic, 21);
  return concat(header, ct);
}

async function sendPush(sub, payloadStr, env) {
  if (!env.VAPID_PRIVATE || !env.VAPID_PUBLIC) return;
  const body = await encryptPayload(sub.p256dh, sub.auth, new TextEncoder().encode(payloadStr));
  const jwt = await vapidJwt(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body,
  });
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (request.method === 'GET') {
      if (url.pathname === '/status') return json({ ok: true, push: true, vapidConfigured: !!env.VAPID_PRIVATE });
      return new Response('ok', { status: 200, headers: cors() });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors() });

    // Per-IP rate limit (guarded — skip if binding absent).
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return new Response('rate limited', { status: 429, headers: cors() });
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return new Response('too large', { status: 413, headers: cors() });
      body = JSON.parse(text);
    } catch {
      return new Response('bad json', { status: 400, headers: cors() });
    }

    // ── Push subscription management ──
    if (url.pathname === '/subscribe') {
      const sub = body && body.subscription;
      const storeId = body && body.storeId;
      const next = body && body.next;                 // 'YYYY-MM-DD' predicted next restock
      const cycle = parseInt(body && body.cycle, 10); // inventory cycle in days
      const name = clean(body && body.name, 80);
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth
          || typeof storeId !== 'string' || !/^[a-z0-9]{1,12}$/i.test(storeId)
          || typeof next !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(next)
          || !(cycle >= 1 && cycle <= 90)) {
        return new Response('bad request', { status: 400, headers: cors() });
      }
      await ensureSchema(env);
      const existing = await env.DB.prepare('SELECT stores FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).first();
      let stores = [];
      if (existing) { try { stores = JSON.parse(existing.stores) || []; } catch {} }
      // stores = array of {id, name, cycle, next}; replace any existing entry for this id.
      stores = stores.filter((x) => x && typeof x === 'object' && x.id !== storeId);
      stores.push({ id: storeId, name, cycle, next });
      stores = stores.slice(-200);
      await env.DB.prepare(
        'INSERT INTO push_subs (endpoint, p256dh, auth, stores) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, stores = excluded.stores'
      ).bind(sub.endpoint, clean(sub.keys.p256dh, 200), clean(sub.keys.auth, 100), JSON.stringify(stores)).run();
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === '/unsubscribe') {
      const endpoint = body && body.endpoint;
      const storeId = body && body.storeId;
      if (!endpoint || typeof endpoint !== 'string') return new Response('bad request', { status: 400, headers: cors() });
      await ensureSchema(env);
      if (storeId) {
        const ex = await env.DB.prepare('SELECT stores FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
        if (ex) {
          let s = []; try { s = JSON.parse(ex.stores) || []; } catch {}
          s = s.filter((x) => !(x && x.id === storeId));
          if (s.length) await env.DB.prepare('UPDATE push_subs SET stores = ? WHERE endpoint = ?').bind(JSON.stringify(s), endpoint).run();
          else await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
        }
      } else {
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
      }
      return new Response(null, { status: 204, headers: cors() });
    }

    // ── Send a test push to an already-subscribed device (on-demand verify) ──
    if (url.pathname === '/test-push') {
      const endpoint = body && body.endpoint;
      if (!endpoint || typeof endpoint !== 'string') return new Response('bad request', { status: 400, headers: cors() });
      await ensureSchema(env);
      const sub = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
      if (!sub) return json({ ok: false, reason: 'not_subscribed' }, 404);
      if (!env.VAPID_PRIVATE) return json({ ok: false, reason: 'push_not_configured' }, 503);
      const payload = JSON.stringify({
        title: '✅ Test — Lviv Second Hand',
        body: 'Notifications are working! You will get an alert when a store you follow restocks.',
        url: 'https://anonymouspartner.github.io/lviv-secondhand/',
        tag: 'test',
      });
      try { await sendPush(sub, payload, env); } catch { return json({ ok: false, reason: 'send_failed' }, 500); }
      return json({ ok: true }, 200);
    }

    // ── Usage metrics (root POST) ──
    const items = Array.isArray(body && body.events) ? body.events : [body];
    const day = new Date().toISOString().slice(0, 10);
    const rows = [];
    for (const e of items.slice(0, MAX_BATCH)) {
      if (!e || !TYPES.has(e.type)) continue;
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

  // ── Daily cron: notify followers whose next predicted restock date has arrived ──
  async scheduled(event, env, ctx) {
    const today = kyivDateStr(); // 'YYYY-MM-DD' (Europe/Kyiv)
    await ensureSchema(env);
    const res = await env.DB.prepare('SELECT endpoint, p256dh, auth, stores FROM push_subs').all();
    const rows = (res && res.results) || [];
    for (const r of rows) {
      let follows = []; try { follows = JSON.parse(r.stores) || []; } catch {}
      let changed = false;
      const hits = [];
      for (const f of follows) {
        if (f && f.id && typeof f.next === 'string' && f.next <= today) {
          hits.push(f);
          // Roll the next restock date forward by the cycle until it's in the future.
          const c = (f.cycle >= 1 && f.cycle <= 90) ? f.cycle : 7;
          let n = f.next;
          while (n <= today) n = addDaysStr(n, c);
          f.next = n;
          changed = true;
        }
      }
      if (changed) {
        await env.DB.prepare('UPDATE push_subs SET stores = ? WHERE endpoint = ?').bind(JSON.stringify(follows), r.endpoint).run();
      }
      if (!hits.length) continue;
      const names = hits.map((f) => f.name || 'A store you follow');
      const bodyText = names.length === 1
        ? `${names[0]} restocks today — fresh stock just in!`
        : `${names.length} stores you follow restock today: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;
      const payload = JSON.stringify({
        title: '🛍️ Fresh stock today!',
        body: bodyText,
        url: 'https://anonymouspartner.github.io/lviv-secondhand/',
        tag: 'restock-' + today,
      });
      ctx.waitUntil(sendPush(r, payload, env).catch(() => {}));
    }
  },
};
