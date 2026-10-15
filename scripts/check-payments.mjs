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

// ── 9 · LiqPay: checkout → signed callback → the same fulfilment ─────────────
// The Worker is configured for LiqPay with sandbox keys. The callbacks below
// are signed the way LiqPay signs them, so they pass the real verification.
const LP_PUB = 'sandbox_i000000', LP_PRIV = 'sandbox_check_payments_private';
const lpEnv = { ...env, PAY_PROVIDER: 'liqpay', LIQPAY_PUBLIC_KEY: LP_PUB, LIQPAY_PRIVATE_KEY: LP_PRIV };
const lpSign = (data, key = LP_PRIV) => crypto.createHash('sha1').update(key + data + key).digest('base64');
const b64json = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

async function lpGet(path) {
  const pending = [];
  const res = await mod.default.fetch(new Request('https://x' + path), lpEnv, { waitUntil(p) { pending.push(p); } });
  await Promise.allSettled(pending);
  return res;
}
// Open a checkout and read back the signed params it hands to LiqPay.
async function lpCheckout(path) {
  const res = await lpGet(path);
  const html = await res.text();
  const data = (/name="data" value="([^"]+)"/.exec(html) || [])[1];
  const sig = (/name="signature" value="([^"]+)"/.exec(html) || [])[1];
  const params = data ? JSON.parse(Buffer.from(data, 'base64').toString('utf8')) : null;
  return { res, html, data, sig, params };
}
async function lpCallback(fields, { key } = {}) {
  const data = b64json(fields);
  const pending = [];
  const res = await mod.default.fetch(new Request('https://x/liqpay-callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data, signature: lpSign(data, key) }).toString(),
  }), lpEnv, { waitUntil(p) { pending.push(p); } });
  await Promise.allSettled(pending);
  return res;
}

{
  // The status endpoint tells the app which provider is live, so it knows to
  // collect the offer text itself.
  const st = await (await lpGet('/status')).json();
  check(st.provider === 'liqpay' && st.promoConfigured === true, `/status under LiqPay reported ${JSON.stringify({ provider: st.provider, promoConfigured: st.promoConfigured })}`);

  // Subscription checkout.
  calls = [];
  const c = await lpCheckout('/promote?store=s20&tier=featured&cadence=monthly&lang=ua&text=' + encodeURIComponent('-15% <з> застосунком') + '&email=shop%40example.com');
  check(c.res.status === 200 && c.params, `LiqPay checkout answered HTTP ${c.res.status} without a signed form`);
  check(c.sig === lpSign(c.data), 'LiqPay checkout form is not signed with the private key');
  check(c.html.includes('action="https://www.liqpay.ua/api/3/checkout"'), 'LiqPay checkout form does not post to LiqPay');
  check(!c.html.includes(LP_PRIV), 'the checkout page leaks the LiqPay private key');
  const p = c.params || {};
  check(p.action === 'subscribe' && p.subscribe_periodicity === 'month' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(p.subscribe_date_start || ''),
    `monthly plan is not a LiqPay subscription: ${JSON.stringify(p)}`);
  check(p.amount === 600 && p.currency === 'UAH', `Featured monthly charged ${p.amount} ${p.currency}, expected 600 UAH`);
  check(p.public_key === LP_PUB && p.language === 'uk' && /\/liqpay-callback$/.test(p.server_url || ''), `LiqPay params wrong: ${JSON.stringify(p)}`);
  const orderId = p.order_id;
  const pre = row('SELECT * FROM payments WHERE id = ?', orderId);
  check(pre && pre.status === 'created' && pre.text === '-15% з застосунком' && pre.email === 'shop@example.com', `prepared payment row wrong: ${JSON.stringify(pre)}`);
  check(!row('SELECT * FROM promos WHERE store_id = ?', 's20'), 'opening a LiqPay checkout published the placement before payment');

  // Forged callback.
  const forged = await lpCallback({ order_id: orderId, status: 'success', payment_id: 1, amount: 600 }, { key: 'wrong' });
  check(forged.status === 400 && !row('SELECT * FROM promos WHERE store_id = ?', 's20'), 'a forged LiqPay callback was accepted');

  // Still processing: nothing yet.
  await lpCallback({ order_id: orderId, status: 'processing', payment_id: 1, amount: 600 });
  check(!row('SELECT * FROM promos WHERE store_id = ?', 's20'), 'a still-processing payment published the placement');

  // Paid.
  calls = [];
  await lpCallback({ action: 'subscribe', order_id: orderId, status: 'subscribed', payment_id: 1, amount: 600, currency: 'UAH' });
  const promo = row('SELECT * FROM promos WHERE store_id = ?', 's20');
  check(promo && promo.tier === 'featured' && promo.status === 'active' && promo.until === plusDays(34) && promo.sub_id === orderId,
    `LiqPay subscription did not go live: ${JSON.stringify(promo)}`);
  check(promo && promo.offer === '-15% з застосунком', 'the offer text collected in the app did not reach the placement');
  check(promo && promo.cust_id === null, 'a LiqPay placement offers the Stripe billing portal');
  check(tgPings().length === 1 && /PROMOTION PAID/.test(tgPings()[0].body.text) && /₴600/.test(tgPings()[0].body.text), 'owner was not told about the LiqPay purchase');
  check(count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's20') === 1, 'LiqPay purchase with an offer did not queue one Instagram ad');

  // Redelivered — and LiqPay's second notice for the same charge.
  calls = [];
  await lpCallback({ action: 'subscribe', order_id: orderId, status: 'subscribed', payment_id: 1, amount: 600 });
  await lpCallback({ action: 'pay', order_id: orderId, status: 'success', payment_id: 1, amount: 600 });
  check(tgPings().length === 0 && count('SELECT COUNT(*) AS n FROM instagram_ads WHERE store_id = ?', 's20') === 1, 'a repeated LiqPay callback fulfilled twice');

  // Next month's charge renews; a redelivery of it does not renew again.
  DB.db.prepare("UPDATE promos SET until = '2000-01-01' WHERE store_id = 's20'").run();
  await lpCallback({ action: 'regular', order_id: orderId, status: 'success', payment_id: 2, amount: 600 });
  check(row('SELECT until FROM promos WHERE store_id = ?', 's20').until === plusDays(34), 'a later LiqPay charge did not renew the subscription');
  DB.db.prepare("UPDATE promos SET until = '2000-01-01' WHERE store_id = 's20'").run();
  await lpCallback({ action: 'regular', order_id: orderId, status: 'success', payment_id: 2, amount: 600 });
  check(row('SELECT until FROM promos WHERE store_id = ?', 's20').until === '2000-01-01', 'a redelivered renewal renewed again');
  check(tgPings().length === 0, 'a renewal pinged the owner');

  // Cancelled.
  await lpCallback({ action: 'unsubscribe', order_id: orderId, status: 'unsubscribed' });
  check(row('SELECT status FROM promos WHERE store_id = ?', 's20').status === 'canceled', 'unsubscribed did not end the LiqPay subscription');

  // The return page sends the buyer to the app's thanks screen.
  const back = await lpGet(`/liqpay-return?id=${orderId}&to=promoted%3Dfeatured`);
  check(back.status === 302 && back.headers.get('Location') === 'https://www.lvivsecondhand.com/?promoted=featured', `return redirect wrong: ${back.status} ${back.headers.get('Location')}`);
  const evil = await lpGet(`/liqpay-return?id=${orderId}&to=${encodeURIComponent('x=1&y=<script>')}`);
  check(evil.headers.get('Location') === 'https://www.lvivsecondhand.com/', 'the return redirect passes through an arbitrary query');
}

{
  // A one-off run is a plain payment, not a subscription; a failed payment does nothing.
  const c = await lpCheckout('/promote?store=s21&tier=spotlight&cadence=run7&lang=en');
  check(c.params && c.params.action === 'pay' && c.params.amount === 400 && !c.params.subscribe_periodicity && c.params.language === 'en',
    `7-day Spotlight run params wrong: ${JSON.stringify(c.params)}`);
  calls = [];
  await lpCallback({ order_id: c.params.order_id, status: 'failure', payment_id: 7, amount: 400 });
  check(row('SELECT status FROM payments WHERE id = ?', c.params.order_id).status === 'failed' && !row('SELECT * FROM promos WHERE store_id = ?', 's21') && tgPings().length === 0,
    'a failed LiqPay payment was fulfilled or announced');
  const back = await lpGet(`/liqpay-return?id=${c.params.order_id}&to=promoted%3Dspotlight`);
  check(back.headers.get('Location') === 'https://www.lvivsecondhand.com/?promoted=cancel', 'a failed payment returned to the thanks screen');
}

{
  // Flash deal: the text is required up front, and the sandbox status counts as paid with sandbox keys.
  const none = await lpGet('/flash-deal?store=s22&tier=24h&lang=ua');
  check(none.status === 400, `a LiqPay flash deal without text answered HTTP ${none.status}, expected 400`);
  const c = await lpCheckout('/flash-deal?store=s22&tier=24h&lang=ua&text=' + encodeURIComponent('Все по 40 ₴'));
  check(c.params && c.params.amount === 60, `24h flash deal charged ${c.params && c.params.amount}, expected 60`);
  calls = [];
  await lpCallback({ order_id: c.params.order_id, status: 'sandbox', payment_id: 22, amount: 60 });
  const f = row('SELECT * FROM flash_deals WHERE id = ?', c.params.order_id);
  check(f && f.status === 'pending' && f.text === 'Все по 40 ₴', `LiqPay flash deal not recorded for review: ${JSON.stringify(f)}`);
  check(tgPings().length === 1 && tgPings()[0].body.text.includes('/flash-deal/approve?id=' + c.params.order_id), 'owner did not get the approval link for a LiqPay flash deal');
}

{
  // An order must carry a way to reach the buyer.
  const none = await lpGet('/order?store=s23&item=deal&lang=ua');
  check(none.status === 400, `a LiqPay order without an email answered HTTP ${none.status}, expected 400`);
  const c = await lpCheckout('/order?store=s23&item=deal&lang=ua&email=owner%40shop.ua&text=' + encodeURIComponent('вітрина'));
  check(c.params && c.params.amount === 300, `deal-of-the-week charged ${c.params && c.params.amount}, expected 300`);
  calls = [];
  await lpCallback({ order_id: c.params.order_id, status: 'success', payment_id: 23, amount: 300 });
  const o = row('SELECT * FROM orders WHERE id = ?', c.params.order_id);
  check(o && o.email === 'owner@shop.ua' && o.note === 'вітрина' && o.amount === 30000, `LiqPay order row wrong: ${JSON.stringify(o)}`);
  check(tgPings().length === 1 && /owner@shop\.ua/.test(tgPings()[0].body.text), 'owner was not given the buyer\'s email for a LiqPay order');

  // A sandbox status must not count with live keys.
  const live = { ...lpEnv, LIQPAY_PUBLIC_KEY: 'i000000live' };
  const res = await mod.default.fetch(new Request('https://x/order?store=s24&item=poster&email=a%40b.ua'), live, { waitUntil() {} });
  const data = (/name="data" value="([^"]+)"/.exec(await res.text()) || [])[1];
  const id = JSON.parse(Buffer.from(data, 'base64').toString('utf8')).order_id;
  const cb = b64json({ order_id: id, status: 'sandbox', payment_id: 24, amount: 150 });
  await mod.default.fetch(new Request('https://x/liqpay-callback', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: cb, signature: lpSign(cb) }).toString(),
  }), live, { waitUntil() {} });
  check(!row('SELECT * FROM orders WHERE id = ?', id), 'a sandbox payment was fulfilled on a live LiqPay shop');
}

{
  // With LiqPay off, nothing about it is reachable.
  const res = await mod.default.fetch(new Request('https://x/liqpay-callback', { method: 'POST', body: 'data=x&signature=y', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), env, { waitUntil() {} });
  check(res.status === 503, `/liqpay-callback answered HTTP ${res.status} with LiqPay off, expected 503`);
}

// ── 10 · bank-transfer invoices: create → page → mark paid → act ────────────
{
  const ADMIN_KEY = 'check-payments-admin';
  const SELLER = {
    SELLER_NAME: 'ФОП Перевірка Тест Тестович', SELLER_TAX_ID: '1234567890', SELLER_ADDRESS: 'м. Львів, вул. Тестова, 1',
    SELLER_IBAN: 'UA213223130000026007233566001', SELLER_TAX_STATUS: 'Єдиний податок, 3 група, без ПДВ',
  };
  const invEnv = { ...env, ADMIN_KEY, ...SELLER };
  const api = async (e, path, body, key = ADMIN_KEY) => {
    const pending = [];
    const res = await mod.default.fetch(new Request('https://x' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: JSON.stringify(body),
    }), e, { waitUntil(p) { pending.push(p); } });
    await Promise.allSettled(pending);
    let j = null; try { j = await res.json(); } catch {}
    return { status: res.status, j };
  };
  const page = async (u) => {
    const r = await mod.default.fetch(new Request(u.replace('https://lviv-metrics.lshanalytic.workers.dev', 'https://x')), invEnv, { waitUntil() {} });
    return { status: r.status, html: await r.text() };
  };

  const noKey = await api(invEnv, '/api/invoice/create', { storeId: 's30', tier: 'featured', cadence: 'monthly' }, 'wrong');
  check(noKey.status === 401, `invoice creation without the admin key answered HTTP ${noKey.status}`);
  const noSeller = await api({ ...env, ADMIN_KEY }, '/api/invoice/create', { storeId: 's30', tier: 'featured', cadence: 'monthly' });
  check(noSeller.status === 503 && noSeller.j && noSeller.j.reason === 'seller_not_configured' && noSeller.j.missing.length === 5,
    `an invoice was issued without the seller's details: ${JSON.stringify(noSeller.j)}`);
  const badPlan = await api(invEnv, '/api/invoice/create', { storeId: 's30', tier: 'gold', cadence: 'monthly' });
  check(badPlan.status === 400, `an unknown plan answered HTTP ${badPlan.status}`);

  const year = kyivToday.slice(0, 4);
  const a = await api(invEnv, '/api/invoice/create', { storeId: 's30', tier: 'featured', cadence: 'monthly', buyer: 'ФОП Покупець, магазин «Тест»' });
  check(a.status === 200 && a.j.ok && a.j.number === `${year}-001` && a.j.amount === 60000, `first invoice wrong: ${JSON.stringify(a.j)}`);
  const b = await api(invEnv, '/api/invoice/create', { storeId: 's31', item: 'poster' });
  check(b.j && b.j.number === `${year}-002` && b.j.amount === 15000, `second invoice not numbered in sequence: ${JSON.stringify(b.j)}`);
  check(a.j && /без ПДВ$/.test(a.j.purpose) && a.j.purpose.includes(`№ ${year}-001`), `payment purpose wrong: ${a.j && a.j.purpose}`);
  check(!row('SELECT * FROM promos WHERE store_id = ?', 's30'), 'issuing an invoice published the placement before payment');

  const inv = await page(a.j.url);
  check(inv.status === 200 && inv.html.includes(`Рахунок на оплату № ${year}-001`) && inv.html.includes(SELLER.SELLER_IBAN)
    && inv.html.includes('ФОП Покупець, магазин «Тест»') && inv.html.includes('600,00') && inv.html.includes('Шістсот гривень 00 копійок'),
    'the invoice page is missing its number, IBAN, buyer, amount or amount in words');
  const forged = await page(a.j.url.replace(/t=[0-9a-f]+/, 't=' + '0'.repeat(40)));
  check(forged.status === 404, `an invoice opened with a wrong token (HTTP ${forged.status})`);
  const earlyAct = await page(a.j.actUrl);
  check(earlyAct.status === 409, `the act was available before payment (HTTP ${earlyAct.status})`);

  calls = [];
  const paid = await api(invEnv, '/api/invoice/paid', { id: `${year}-001` });
  check(paid.j && paid.j.state === 'fulfilled', `marking the invoice paid: ${JSON.stringify(paid.j)}`);
  const p = row('SELECT * FROM promos WHERE store_id = ?', 's30');
  check(p && p.tier === 'featured' && p.until === plusDays(34) && p.status === 'active', `a paid invoice did not publish the placement: ${JSON.stringify(p)}`);
  check(tgPings().length === 1 && /PROMOTION PAID/.test(tgPings()[0].body.text), 'owner was not told the invoiced placement is live');
  const again = await api(invEnv, '/api/invoice/paid', { id: `inv-${year}-001` });
  check(again.j && again.j.state === 'already_paid' && tgPings().length === 1, 'marking an invoice paid twice fulfilled it twice');
  const unknown = await api(invEnv, '/api/invoice/paid', { id: `${year}-999` });
  check(unknown.j && unknown.j.reason === 'unknown_invoice', 'an unknown invoice number was accepted');

  const act = await page(a.j.actUrl);
  check(act.status === 200 && act.html.includes(`Акт надання послуг № ${year}-001`) && act.html.includes('претензій'), 'the act did not render after payment');

  await api(invEnv, '/api/invoice/paid', { id: `${year}-002` });
  const o = row('SELECT * FROM orders WHERE id = ?', `inv-${year}-002`);
  check(o && o.item === 'poster' && o.amount === 15000, `an invoiced extra was not recorded as an order: ${JSON.stringify(o)}`);

  // Amounts in words, across the rate card's shapes.
  const words = { 'spotlight/annual': 'Дванадцять тисяч гривень 00 копійок', 'verified/annual': 'Дві тисячі пʼятсот гривень 00 копійок',
    'spotlight/monthly': 'Одна тисяча двісті гривень 00 копійок', 'verified/run1': 'Пʼятдесят гривень 00 копійок', 'verified/monthly': 'Двісті пʼятдесят гривень 00 копійок' };
  for (const [plan, want] of Object.entries(words)) {
    const [tier, cadence] = plan.split('/');
    const r = await api(invEnv, '/api/invoice/create', { storeId: 's32', tier, cadence });
    const h = (await page(r.j.url)).html;
    check(h.includes(want), `${plan}: amount in words is not "${want}"`);
  }
}

// ── 11 · the Worker charges what the app shows ───────────────────────────────
// The app's rate card is display-only; what is charged lives in the Worker.
// Under Stripe the charged amount comes from Stripe's own Price objects, but
// under LiqPay it comes from these constants, so a mismatch would charge a
// store a different number than the one it agreed to.
{
  const fs = await import('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const worker = fs.readFileSync('worker/worker.js', 'utf8');
  for (const m of html.matchAll(/\{ tier:'(\w+)',\s*monthly:(\d+),\s*annual:(\d+),\s*run1:(\d+),\s*run7:(\d+),\s*run30:(\d+)/g)) {
    const [, tier, monthly, annual, run1, run7, run30] = m;
    const want = { monthly, annual, run1, run7, run30 };
    for (const [cad, uahStr] of Object.entries(want)) {
      const re = cad.startsWith('run')
        ? new RegExp(`${tier}_${cad}:\\s*\\{\\s*amount:\\s*(\\d+)`)
        : new RegExp(`${tier}_${cad}:\\s*(\\d+)`);
      const got = (re.exec(worker) || [])[1];
      check(Number(got) === Number(uahStr) * 100, `${tier} ${cad}: app shows ₴${uahStr}, Worker charges ${got == null ? 'nothing' : got / 100}`);
    }
  }
  for (const m of html.matchAll(/\{ item:'(\w+)',\s*price:(\d+)/g)) {
    const got = (new RegExp(`\\b${m[1]}:\\s*\\{[^}]*amount:\\s*(\\d+)`).exec(worker) || [])[1];
    check(Number(got) === Number(m[2]) * 100, `extra "${m[1]}": app shows ₴${m[2]}, Worker charges ${got == null ? 'nothing' : got / 100}`);
  }
  for (const m of html.matchAll(/\{ tier:'(\w+)',\s*hours:\d+,\s*price:(\d+)/g)) {
    const got = (new RegExp(`'${m[1]}':\\s*\\{\\s*amount:\\s*(\\d+)`).exec(worker) || [])[1];
    check(Number(got) === Number(m[2]) * 100, `flash deal ${m[1]}: app shows ₴${m[2]}, Worker charges ${got == null ? 'nothing' : got / 100}`);
  }
}

if (errors.length) {
  console.error('\nPayment check FAILED:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('Payments OK — Stripe, LiqPay and invoices: every kind of sale fulfils once; forged, failed and sandbox-on-live events do nothing; charged amounts match the app.');
