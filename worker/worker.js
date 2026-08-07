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

const PRIMARY_ORIGIN = 'https://www.lvivsecondhand.com';
const ALLOWED_ORIGINS = new Set([
  'https://www.lvivsecondhand.com',
  'https://lvivsecondhand.com',
  'https://anonymouspartner.github.io', // legacy GitHub Pages origin (transition)
]);
const APP_URL = 'https://www.lvivsecondhand.com/';
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

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(obj, status, origin) { return new Response(obj == null ? null : JSON.stringify(obj), { status: status || 200, headers: { ...cors(origin), 'Content-Type': 'application/json' } }); }
function clean(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

let _schemaReady = false;
async function ensureSchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, stores TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL DEFAULT (datetime('now')))"
  ).run();
  // Paid in-app promotions, self-fulfilled from Stripe (see stripe-webhook).
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS promos (store_id TEXT PRIMARY KEY, tier TEXT NOT NULL, offer TEXT, until TEXT NOT NULL, sub_id TEXT, cadence TEXT, cust_id TEXT, status TEXT NOT NULL DEFAULT 'active', updated TEXT NOT NULL DEFAULT (datetime('now')))"
  ).run();
  // cust_id was added after the table shipped; ignore the error on tables that
  // already have it (SQLite has no ADD COLUMN IF NOT EXISTS).
  try { await env.DB.prepare('ALTER TABLE promos ADD COLUMN cust_id TEXT').run(); } catch {}
  _schemaReady = true;
}

// ── Store promotions ↔ Stripe ────────────────────────────────────────────────
// The rate card (docs/ADVERTISING.md) as Stripe Price ids, keyed by tier+cadence.
// A store-bound Checkout Session (GET /promote) carries the store id in metadata;
// the signed webhook (POST /stripe-webhook) writes/expires the promo in D1; the
// app reads the live set from GET /promos and renders the gold pin/badge/offer.
const PROMO_PRICES = {
  verified_monthly:  'price_1U1dvd7ZlQqI3gQVAk6edEci',
  verified_annual:   'price_1U1dvn7ZlQqI3gQVH2XJobOD',
  featured_monthly:  'price_1U1dvq7ZlQqI3gQV51PMcCVM',
  featured_annual:   'price_1U1dvt7ZlQqI3gQVd8utdXLA',
  spotlight_monthly: 'price_1U1dvv7ZlQqI3gQVR5qnNNHk',
  spotlight_annual:  'price_1U1dw17ZlQqI3gQVuizcyhYi',
};
const PROMO_TIERS = new Set(['verified', 'featured', 'spotlight']);
const PROMO_CADENCES = new Set(['monthly', 'annual']);

// The shopper-facing offer line ("-10% з застосунком"). Free text typed by whoever
// pays, so it is clamped here before it ever reaches Stripe metadata or D1: angle
// brackets stripped, whitespace collapsed, length capped. The app also escapes it
// on render — this is the second of the two gates, not the only one.
const OFFER_MAX = 48;
function cleanOffer(raw) {
  const s = String(raw || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, OFFER_MAX);
}

// Verify Stripe's `Stripe-Signature` header (HMAC-SHA256 over `${t}.${payload}`).
async function verifyStripeSig(payload, header, secret) {
  const parts = {};
  for (const kv of String(header).split(',')) { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1); }
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // reject >5 min skew (replay)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// Apply a verified Stripe event to the promos table (activate / extend / cancel).
async function applyPromoEvent(env, ev) {
  const o = (ev && ev.data && ev.data.object) || {};
  const type = ev && ev.type;
  const graceDays = (cad) => (cad === 'annual' ? 372 : 34); // period + a few days' grace
  if (type === 'checkout.session.completed') {
    const storeId = o.client_reference_id || (o.metadata && o.metadata.storeId);
    const tier = o.metadata && o.metadata.tier;
    const cadence = (o.metadata && o.metadata.cadence) === 'annual' ? 'annual' : 'monthly';
    if (!storeId || !PROMO_TIERS.has(tier)) return;
    // Re-clean rather than trusting the round-trip: metadata could have been set
    // by any caller holding the key, not just our own /promote.
    const offer = cleanOffer(o.metadata && o.metadata.offer) || null;
    const until = addDaysStr(kyivDateStr(), graceDays(cadence));
    await env.DB.prepare(
      "INSERT INTO promos (store_id, tier, offer, until, sub_id, cadence, cust_id, status, updated) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now')) " +
      "ON CONFLICT(store_id) DO UPDATE SET tier=excluded.tier, offer=excluded.offer, until=excluded.until, sub_id=excluded.sub_id, cadence=excluded.cadence, cust_id=excluded.cust_id, status='active', updated=datetime('now')"
    ).bind(storeId, tier, offer, until, o.subscription || null, cadence, o.customer || null).run();
  } else if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    const subId = o.subscription;
    if (!subId) return;
    const row = await env.DB.prepare('SELECT cadence FROM promos WHERE sub_id = ?').bind(subId).first();
    const until = addDaysStr(kyivDateStr(), graceDays(row && row.cadence));
    await env.DB.prepare("UPDATE promos SET until = ?, status = 'active', updated = datetime('now') WHERE sub_id = ?").bind(until, subId).run();
  } else if (type === 'customer.subscription.deleted' ||
             (type === 'customer.subscription.updated' && ['canceled', 'unpaid', 'incomplete_expired'].includes(o.status))) {
    await env.DB.prepare("UPDATE promos SET status = 'canceled', updated = datetime('now') WHERE sub_id = ?").bind(o.id).run();
  }
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
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === 'GET') {
      if (url.pathname === '/status') {
        let subs = null;
        try { await ensureSchema(env); const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first(); subs = c ? c.n : 0; } catch {}
        return json({ ok: true, push: true, vapidConfigured: !!env.VAPID_PRIVATE, subs, promoConfigured: !!env.STRIPE_API_KEY }, 200, origin);
      }
      // Live paid promotions: { storeId: {tier, offer?, until} }. The app merges
      // these onto STORES so the gold pin/badge/offer render automatically.
      if (url.pathname === '/promos') {
        try {
          await ensureSchema(env);
          const res = await env.DB.prepare("SELECT store_id, tier, offer, until, cust_id FROM promos WHERE status = 'active' AND until >= ?").bind(kyivDateStr()).all();
          const out = {};
          for (const r of (res && res.results) || []) {
            const p = { tier: r.tier, until: r.until };
            if (r.offer) p.offer = r.offer;
            if (r.cust_id) p.manage = true; // app shows "Manage billing" only when a portal is reachable
            out[r.store_id] = p;
          }
          return json(out, 200, origin);
        } catch { return json({}, 200, origin); }
      }
      // Store-bound Stripe Checkout: /promote?store=<id>&tier=<t>&cadence=<c>.
      // Redirects to a hosted checkout carrying the store id so the webhook can
      // fulfil it. Inert (503) until STRIPE_API_KEY is configured.
      if (url.pathname === '/promote') {
        const store = url.searchParams.get('store') || '';
        const tier = url.searchParams.get('tier') || 'featured';
        const cadence = url.searchParams.get('cadence') || 'monthly';
        const offer = cleanOffer(url.searchParams.get('offer'));
        if (!/^[a-z0-9]{1,12}$/i.test(store) || !PROMO_TIERS.has(tier) || !PROMO_CADENCES.has(cadence)) {
          return new Response('bad request', { status: 400, headers: cors(origin) });
        }
        const price = PROMO_PRICES[`${tier}_${cadence}`];
        if (!price) return new Response('unknown tier', { status: 400, headers: cors(origin) });
        if (!env.STRIPE_API_KEY) return new Response('checkout not configured', { status: 503, headers: cors(origin) });
        const form = new URLSearchParams();
        form.set('mode', 'subscription');
        form.set('line_items[0][price]', price);
        form.set('line_items[0][quantity]', '1');
        form.set('allow_promotion_codes', 'true');
        form.set('client_reference_id', store);
        form.set('metadata[storeId]', store);
        form.set('metadata[tier]', tier);
        form.set('metadata[cadence]', cadence);
        form.set('subscription_data[metadata][storeId]', store);
        form.set('subscription_data[metadata][tier]', tier);
        form.set('subscription_data[metadata][cadence]', cadence);
        if (offer) {
          form.set('metadata[offer]', offer);
          form.set('subscription_data[metadata][offer]', offer);
        }
        form.set('success_url', APP_URL + '?promoted=' + encodeURIComponent(tier));
        form.set('cancel_url', APP_URL + '?promoted=cancel');
        let data;
        try {
          const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.STRIPE_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form,
          });
          data = await res.json();
          if (!res.ok || !data.url) return new Response('checkout error', { status: 502, headers: cors(origin) });
        } catch { return new Response('checkout error', { status: 502, headers: cors(origin) }); }
        return Response.redirect(data.url, 302);
      }
      // Self-service billing: /billing?store=<id> sends the paying store to the
      // Stripe customer portal (change tier, update card, cancel) so none of that
      // has to come through the owner. Needs the restricted key to also carry
      // "Billing Portal Sessions: Write" plus a saved portal configuration —
      // without either, this 404s/502s and the app simply hides the link.
      if (url.pathname === '/billing') {
        const store = url.searchParams.get('store') || '';
        if (!/^[a-z0-9]{1,12}$/i.test(store)) return new Response('bad request', { status: 400, headers: cors(origin) });
        if (!env.STRIPE_API_KEY) return new Response('billing not configured', { status: 503, headers: cors(origin) });
        let cust = null;
        try {
          await ensureSchema(env);
          const row = await env.DB.prepare('SELECT cust_id FROM promos WHERE store_id = ?').bind(store).first();
          cust = row && row.cust_id;
        } catch {}
        if (!cust) return new Response('no subscription', { status: 404, headers: cors(origin) });
        const form = new URLSearchParams();
        form.set('customer', cust);
        form.set('return_url', APP_URL);
        try {
          const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.STRIPE_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form,
          });
          const data = await res.json();
          if (!res.ok || !data.url) return new Response('billing error', { status: 502, headers: cors(origin) });
          return Response.redirect(data.url, 302);
        } catch { return new Response('billing error', { status: 502, headers: cors(origin) }); }
      }
      return new Response('ok', { status: 200, headers: cors(origin) });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors(origin) });

    // ── Stripe webhook: self-fulfil paid promotions ──
    // Handled before rate-limiting/JSON-parse because the raw body is needed for
    // signature verification. Inert (503) until STRIPE_WEBHOOK_SECRET is set.
    if (url.pathname === '/stripe-webhook') {
      if (!env.STRIPE_WEBHOOK_SECRET) return new Response('not configured', { status: 503 });
      const payload = await request.text();
      const sig = request.headers.get('Stripe-Signature') || '';
      if (!(await verifyStripeSig(payload, sig, env.STRIPE_WEBHOOK_SECRET))) return new Response('bad signature', { status: 400 });
      let ev; try { ev = JSON.parse(payload); } catch { return new Response('bad json', { status: 400 }); }
      try { await ensureSchema(env); await applyPromoEvent(env, ev); } catch {}
      return new Response('ok', { status: 200 }); // 2xx so Stripe stops retrying
    }

    // Per-IP rate limit (guarded — skip if binding absent).
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return new Response('rate limited', { status: 429, headers: cors(origin) });
    }

    // ── Admin: broadcast a test push to every subscription (server-side verify) ──
    if (url.pathname === '/admin/test') {
      if (!env.ADMIN_KEY || request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ ok: false, reason: 'unauthorized' }, 401, origin);
      if (!env.VAPID_PRIVATE) return json({ ok: false, reason: 'push_not_configured' }, 503, origin);
      await ensureSchema(env);
      const res = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs').all();
      const subs = (res && res.results) || [];
      const payload = JSON.stringify({
        title: '✅ Server test — Lviv Second Hand',
        body: 'This test push was sent from the server. Restock alerts are working!',
        url: APP_URL,
        tag: 'admin-test',
      });
      let sent = 0;
      for (const s of subs) { try { await sendPush(s, payload, env); sent++; } catch {} }
      return json({ ok: true, count: subs.length, sent }, 200, origin);
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return new Response('too large', { status: 413, headers: cors(origin) });
      body = JSON.parse(text);
    } catch {
      return new Response('bad json', { status: 400, headers: cors(origin) });
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
        return new Response('bad request', { status: 400, headers: cors(origin) });
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
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === '/unsubscribe') {
      const endpoint = body && body.endpoint;
      const storeId = body && body.storeId;
      if (!endpoint || typeof endpoint !== 'string') return new Response('bad request', { status: 400, headers: cors(origin) });
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
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // ── Send a test push to an already-subscribed device (on-demand verify) ──
    if (url.pathname === '/test-push') {
      const endpoint = body && body.endpoint;
      if (!endpoint || typeof endpoint !== 'string') return new Response('bad request', { status: 400, headers: cors(origin) });
      await ensureSchema(env);
      const sub = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = ?').bind(endpoint).first();
      if (!sub) return json({ ok: false, reason: 'not_subscribed' }, 404, origin);
      if (!env.VAPID_PRIVATE) return json({ ok: false, reason: 'push_not_configured' }, 503, origin);
      const payload = JSON.stringify({
        title: '✅ Test — Lviv Second Hand',
        body: 'Notifications are working! You will get an alert when a store you follow restocks.',
        url: APP_URL,
        tag: 'test',
      });
      try { await sendPush(sub, payload, env); } catch { return json({ ok: false, reason: 'send_failed' }, 500, origin); }
      return json({ ok: true }, 200, origin);
    }

    // ── Usage metrics (root POST) ──
    const items = Array.isArray(body && body.events) ? body.events : [body];
    const day = new Date().toISOString().slice(0, 10);
    const rows = [];
    for (const e of items.slice(0, MAX_BATCH)) {
      if (!e || !TYPES.has(e.type)) continue;
      rows.push({ type: e.type, key: clean(e.key, 40), lang: LANGS.has(e.lang) ? e.lang : null });
    }
    if (!rows.length) return new Response(null, { status: 204, headers: cors(origin) });
    try {
      const stmt = env.DB.prepare('INSERT INTO events (day, type, key, lang) VALUES (?, ?, ?, ?)');
      await env.DB.batch(rows.map((r) => stmt.bind(day, r.type, r.key, r.lang)));
    } catch {
      return new Response('db error', { status: 500, headers: cors(origin) });
    }
    return new Response(null, { status: 204, headers: cors(origin) });
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
        url: APP_URL,
        tag: 'restock-' + today,
      });
      ctx.waitUntil(sendPush(r, payload, env).catch(() => {}));
    }
  },
};
