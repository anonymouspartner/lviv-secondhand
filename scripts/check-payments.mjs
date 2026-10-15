// Payment fulfilment check — runs the metrics Worker against a real SQLite
// database and feeds it signed payment-provider events, then asserts what
// landed in the tables and who was told.
//
// The purchase path has three kinds of sale (promotion, à la carte order,
// flash deal), each with its own side effects (D1 rows, an owner ping, an
// Instagram ad, a map patch, a subscriber broadcast). Nothing else exercises
// them end to end, and a payment that is taken but not fulfilled is the most
// expensive bug this project can ship. So this runs the real code paths rather
// than reading them.
//
// node:sqlite stands in for D1. It is the same engine D1 runs, so the SQL —
// ON CONFLICT clauses, datetime('now'), change counts — behaves as it will in
// production, which a hand-written stub would only imitate.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// ── D1 over SQLite ───────────────────────────────────────────────────────────
function d1() {
  const db = new DatabaseSync(':memory:');
  const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  return {
    db,
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = norm(a); return this; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
    },
  };
}

// ── outbound calls ───────────────────────────────────────────────────────────
// Every fetch the Worker makes is recorded and answered locally: Telegram
// (owner pings, broadcasts) and GitHub (map patches, Instagram ad renders).
let calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  let body = null;
  try { body = init && init.body ? JSON.parse(init.body) : null; } catch { body = init && init.body; }
  calls.push({ url: u, body });
  if (u.includes('api.github.com')) return new Response(null, { status: 204 });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const tgPings = () => calls.filter((c) => c.url.includes('api.telegram.org') && c.body && c.body.chat_id === OWNER);
const dispatches = (type) => calls.filter((c) => c.url.includes('api.github.com') && c.body && c.body.event_type === type);

// ── Stripe events ────────────────────────────────────────────────────────────
const SECRET = 'whsec_check_payments';
const OWNER = '1001';
function stripeSig(payload, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
const session = (id, o) => ({ id: 'evt_' + id, type: 'checkout.session.completed', data: { object: { id, ...o } } });
const field = (key, value) => ({ key, text: { value } });

const mod = await import('../worker/worker.js');
const DB = d1();
const env = { DB, STRIPE_WEBHOOK_SECRET: SECRET, BOT_TOKEN: 'bot', OWNER_ID: OWNER, GH_PAT: 'ghp_check' };

async function deliver(ev, { sig } = {}) {
  const payload = JSON.stringify(ev);
  const pending = [];
  const res = await mod.default.fetch(
    new Request('https://x/stripe-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig || stripeSig(payload) },
      body: payload,
    }),
    env,
    { waitUntil(p) { pending.push(p); } },
  );
  await Promise.allSettled(pending);
  return res;
}
const row = (sql, ...a) => DB.db.prepare(sql).get(...a);
const count = (sql, ...a) => Number(DB.db.prepare(sql).get(...a).n);

const kyivToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
const plusDays = (n) => { const d = new Date(kyivToday + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── 1 · a forged event is refused ────────────────────────────────────────────
{
  const res = await deliver(session('cs_forged', { client_reference_id: 's1', metadata: { tier: 'featured', cadence: 'monthly' } }), { sig: 't=1,v1=00' });
  check(res.status === 400, `forged signature answered HTTP ${res.status}, expected 400`);
  check(count('SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?', 'promos') === 0 || count('SELECT COUNT(*) AS n FROM promos') === 0,
    'a forged event wrote a promotion');
}

// ── 2 · a subscription purchase goes live, once ──────────────────────────────
{
  calls = [];
  const ev = session('cs_sub', {
    client_reference_id: 's10', amount_total: 60000, subscription: 'sub_1', customer: 'cus_1',
    metadata: { storeId: 's10', tier: 'featured', cadence: 'monthly' },
    custom_fields: [field('offer', '-10% <з> застосунком')],
  });
  const res = await deliver(ev);
  check(res.status === 200, `subscription purchase answered HTTP ${res.status}`);
  const p = row('SELECT * FROM promos WHERE store_id = ?', 's10');
  check(p && p.tier === 'featured' && p.cadence === 'monthly' && p.status === 'active', `subscription promo row wrong: ${JSON.stringify(p)}`);
  check(p && p.until === plusDays(34), `subscription runs until ${p && p.until}, expected ${plusDays(34)}`);
  check(p && p.sub_id === 'sub_1' && p.cust_id === 'cus_1', 'subscription promo lost its subscription/customer ids (renewal and /billing need them)');
  check(p && p.offer === '-10% з застосунком', `offer line not cleaned: ${p && p.offer}`);
  check(tgPings().length === 1 && /PROMOTION PAID/.test(tgPings()[0].body.text), 'owner was not told about the paid promotion exactly once');
  check(count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's10') === 1 && dispatches('instagram_ad').length === 1,
    'a purchase with an offer line did not queue exactly one Instagram ad');

  // Stripe redelivers. The placement must not double up and the owner must not
  // get a second "paid" ping or a second ad to approve.
  calls = [];
  await deliver(ev);
  check(tgPings().length === 0, 'a redelivered purchase pinged the owner again');
  check(count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's10') === 1, 'a redelivered purchase queued a second Instagram ad');
}

// ── 3 · a renewal extends it, a cancellation ends it ─────────────────────────
{
  DB.db.prepare("UPDATE promos SET until = '2000-01-01' WHERE store_id = 's10'").run();
  calls = [];
  await deliver({ id: 'evt_inv', type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_1' } } });
  const p = row('SELECT * FROM promos WHERE store_id = ?', 's10');
  check(p.until === plusDays(34), `renewal set until ${p.until}, expected ${plusDays(34)}`);
  check(tgPings().length === 0, 'a renewal pinged the owner (only purchases should)');
  check(count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's10') === 1, 'a renewal queued an Instagram ad');

  await deliver({ id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } });
  check(row('SELECT status FROM promos WHERE store_id = ?', 's10').status === 'canceled', 'subscription.deleted did not cancel the promotion');
}

// ── 4 · a one-off run ends when paid for and has nothing to manage ───────────
{
  calls = [];
  await deliver(session('cs_run', {
    client_reference_id: 's11', amount_total: 20000,
    metadata: { storeId: 's11', tier: 'featured', cadence: 'run7' },
  }));
  const p = row('SELECT * FROM promos WHERE store_id = ?', 's11');
  check(p && p.until === plusDays(7) && p.cadence === 'run7', `7-day run wrong: ${JSON.stringify(p)}`);
  check(p && p.cust_id === null, 'a one-off run kept a customer id, so the app would offer a billing portal for nothing');
  check(count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's11') === 0, 'a purchase with no offer line queued an Instagram ad');
  check(tgPings().length === 1 && /No Instagram ad/.test(tgPings()[0].body.text), 'owner was not told the run had no offer line');
}

// ── 5 · an à la carte order is recorded for hand fulfilment ──────────────────
{
  calls = [];
  const ev = session('cs_order', {
    client_reference_id: 's12', amount_total: 15000, currency: 'uah',
    customer_details: { email: 'shop@example.com' },
    metadata: { storeId: 's12', item: 'poster' },
    custom_fields: [field('note', 'біля каси')],
  });
  await deliver(ev);
  const o = row('SELECT * FROM orders WHERE id = ?', 'cs_order');
  check(o && o.item === 'poster' && o.amount === 15000 && o.email === 'shop@example.com' && o.note === 'біля каси' && o.status === 'paid',
    `order row wrong: ${JSON.stringify(o)}`);
  check(!row('SELECT * FROM promos WHERE store_id = ?', 's12'), 'an order created a placement');
  check(tgPings().length === 1 && /NEW ORDER/.test(tgPings()[0].body.text), 'owner was not told about the order');
  calls = [];
  await deliver(ev);
  check(count('SELECT COUNT(*) AS n FROM orders') === 1 && tgPings().length === 0, 'a redelivered order was recorded or announced twice');
}

// ── 6 · a flash deal waits for review without a PIN ──────────────────────────
{
  calls = [];
  await deliver(session('cs_flash', {
    client_reference_id: 's13', amount_total: 6000,
    metadata: { kind: 'flashDeal', storeId: 's13', tier: '24h' },
    custom_fields: [field('dealText', 'Все по 50 ₴')],
  }));
  const f = row('SELECT * FROM flash_deals WHERE id = ?', 'cs_flash');
  check(f && f.status === 'pending' && f.text === 'Все по 50 ₴' && f.token, `unreviewed flash deal row wrong: ${JSON.stringify(f)}`);
  check(dispatches('map_patch').length === 0 && dispatches('store_patch').length === 0 && calls.filter((c) => c.url.includes('dispatches') && c.body.event_type !== 'instagram_ad').length === 0,
    'an unreviewed flash deal was published to the map');
  check(tgPings().length === 1 && tgPings()[0].body.text.includes('/flash-deal/approve?id=cs_flash'), 'owner did not get the approval link');
}

// ── 7 · …and goes live at once with the store's PIN ──────────────────────────
{
  DB.db.prepare("INSERT INTO store_pins (store_id, pin) VALUES ('s14', '4321')").run();
  calls = [];
  await deliver(session('cs_flash_pin', {
    client_reference_id: 's14', amount_total: 3000,
    metadata: { kind: 'flashDeal', storeId: 's14', tier: '3h', pin: '4321' },
    custom_fields: [field('dealText', '-30% на все')],
  }));
  const f = row('SELECT * FROM flash_deals WHERE id = ?', 'cs_flash_pin');
  check(f && f.status === 'auto', `PIN-verified flash deal not auto-published: ${JSON.stringify(f)}`);
  const mapCalls = calls.filter((c) => c.url.includes('api.github.com') && c.body.event_type !== 'instagram_ad');
  check(mapCalls.length === 1, `PIN-verified flash deal dispatched ${mapCalls.length} map patches, expected 1`);
  check(tgPings().length === 1 && /auto-published/.test(tgPings()[0].body.text), 'owner was not told the deal auto-published');
}

// ── 8 · a flash deal with no text publishes nothing ──────────────────────────
{
  calls = [];
  await deliver(session('cs_flash_empty', {
    client_reference_id: 's15', metadata: { kind: 'flashDeal', storeId: 's15', tier: '3h' }, custom_fields: [field('dealText', '  <> ')],
  }));
  check(!row('SELECT * FROM flash_deals WHERE id = ?', 'cs_flash_empty') && tgPings().length === 0, 'an empty flash deal was recorded or announced');
}

if (errors.length) {
  console.error('\nPayment check FAILED:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('Payments OK — purchase, redelivery, renewal, cancellation, run, order and both flash-deal paths fulfil correctly.');
