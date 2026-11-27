// Барахолка nationwide shipping — end to end (docs/MARKET.md, "Shipping").
//
// Drives the real bot webhook handler with its METRICS binding wired to the
// real metrics Worker, which runs against node:sqlite (the engine D1 runs, as
// in check-payments.mjs). Only Telegram is stubbed. So every assertion below is
// about what actually lands in the table and what actually goes to Telegram.
//
//   1. migration — a database made with the ORIGINAL listings table and an old
//      row gets the new columns, the row reads as Lviv / no shipping, and
//      ensureSchema is idempotent; the old row still renders;
//   2. the /sell wizard without shipping, and city is required (buttons only,
//      and the Worker refuses a create with no or an unknown city);
//   3. the wizard with shipping: carrier multi-select (at least one), COD;
//      the moderation message and the published post show city, shipping,
//      the safety link and the trust line; the post carries «Поскаржитись»;
//   4. buyer filters — the public feed and the bot's two buttons, including
//      "ask the city once, then remember it";
//   5. complaints — distinct users only, the seller cannot vote, the third
//      distinct report hides the listing (feed, channel post, admin, seller),
//      and the admin's restore brings it back with only newer reports counting;
//   6. the seller trust line.
//
//   node --no-warnings scripts/check-market.mjs          — run the checks
//   node --no-warnings scripts/check-market.mjs --dump   — also print sample
//     moderation messages and published posts, with and without shipping
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = process.argv.includes('--dump');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const dumps = [];

// ── D1 over SQLite ───────────────────────────────────────────────────────────
const db = new DatabaseSync(':memory:');
const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
const DB = {
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
const row = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);

// ── 1 · an existing database, as production has it today ─────────────────────
// The CREATE TABLE exactly as it shipped before this change (plus ig_ok, which
// an earlier ALTER added), and one live listing made by the old wizard.
db.exec("CREATE TABLE listings (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, seller_username TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, price_uah INTEGER NOT NULL, size TEXT, condition TEXT, area TEXT, photo_ids TEXT NOT NULL, status TEXT NOT NULL, channel_msg_id INTEGER, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, nudged_at TEXT, ig_ok INTEGER)");
const OLD_SELLER = '3000';
db.prepare("INSERT INTO listings (id, seller_id, seller_username, category, title, price_uah, size, condition, area, photo_ids, status, channel_msg_id, created_at, expires_at, ig_ok) VALUES ('0ld00001', ?, 'old_seller', 'women', 'Джинсова куртка', 450, 'M', '8/10', 'Сихів, самовивіз', '[\"old-photo\"]', 'live', 901, '2026-10-01', '2099-01-01', 1)").run(OLD_SELLER);

// ── outbound calls ───────────────────────────────────────────────────────────
let tgCalls = [];
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(\w+)/);
  if (m) {
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}
    tgCalls.push({ method: m[1], body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 5000 + tgCalls.length } }));
  }
  return new Response('{}', { status: 404 });
};

execFileSync(process.execPath, ['build-data.mjs'], { cwd: join(ROOT, 'telegram-bot'), stdio: 'ignore' });
const metrics = (await import('../worker/worker.js')).default;
const bot = (await import('../telegram-bot/worker.js')).default;

const OWNER = '1000';
const ADMIN_KEY = 'k';
const menv = { DB, ADMIN_KEY, BOT_TOKEN: 't', TG_CHANNEL: '@Test_Channel', OWNER_ID: OWNER };
const metricsCall = async (req) => {
  const pending = [];
  const res = await metrics.fetch(req, menv, { waitUntil: (p) => pending.push(p) });
  await Promise.allSettled(pending);
  return res;
};
const api = async (path, payload) => (await metricsCall(new Request(`https://m.internal${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: ADMIN_KEY, ...payload }),
}))).json();
const feed = async (qs) => (await metricsCall(new Request(`https://m.internal/api/market${qs}`))).json();

const kv = new Map();
const VISITS = {
  async get(k, o) { const v = kv.get(k); if (v == null) return null; return o && o.type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [], list_complete: true }; },
};
const env = {
  WEBHOOK_SECRET: 's', BOT_TOKEN: 't', OWNER_ID: OWNER, AGENT_IDS: '', VISITS, TG_CHANNEL: '@Test_Channel', ADMIN_KEY,
  METRICS: { fetch: (req) => metricsCall(req) },
};
const send = async (update) => {
  const pending = [];
  const res = await bot.fetch(new Request('https://bot.example/', {
    method: 'POST', body: JSON.stringify(update),
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 's' },
  }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};
const msgFrom = (uid, uname, extra) => send({ update_id: 1, message: { message_id: 1, from: { id: uid, username: uname }, chat: { id: uid, type: 'private' }, ...extra } });
const text = (uid, t, uname = 'seller_test') => msgFrom(uid, uname, { text: t });
const photo = (uid, id) => msgFrom(uid, 'seller_test', { photo: [{ file_id: id + '-small' }, { file_id: id }] });
const sessionOf = (uid) => VISITS.get(`sell-session:${uid}`, { type: 'json' });
const lastTo = (chat) => [...tgCalls].reverse().find((c) => (c.method === 'sendMessage' || c.method === 'sendPhoto') && String(c.body.chat_id) === String(chat));
const kbOf = (call) => (call && call.body.reply_markup && call.body.reply_markup.keyboard || []).flat().map((b) => b.text);
const callback = (uid, data, message) => send({ update_id: 2, callback_query: { id: 'cq', data, from: { id: Number(uid) }, message } });

// Migration: any D1 route runs ensureSchema. Run it twice — the ALTERs must
// fail harmlessly the second time (D1 throws "duplicate column", so does SQLite).
{
  await feed('');
  await feed('');
  const cols = all('PRAGMA table_info(listings)').map((c) => c.name);
  for (const col of ['city', 'ships_nationwide', 'carriers', 'cod', 'reports_cleared_at']) check(cols.includes(col), `migration: listings has no ${col} column`);
  const old = row("SELECT * FROM listings WHERE id = '0ld00001'");
  check(old.city === 'lviv', `migration: old listing city = ${old.city}, want lviv`);
  check(old.ships_nationwide === 0 && old.carriers === null && old.cod === null, 'migration: old listing should read as no shipping');
  check(all("SELECT name FROM sqlite_master WHERE name = 'listing_reports'").length === 1, 'migration: listing_reports not created');
  const f = await feed('?filter=city&city=lviv');
  check(f.ok && f.listings.some((l) => l.id === '0ld00001' && l.city === 'lviv' && l.ships_nationwide === false), `migration: old listing missing from the Lviv feed: ${JSON.stringify(f)}`);
  console.log('migration: columns added, old row = Lviv / no shipping, idempotent, still in the feed');
}

// Walk the wizard up to the city step.
const SELLER = 2000;
async function wizardToCity(uid, title) {
  kv.delete(`sell-session:${uid}`);
  await text(uid, '/sell');
  await text(uid, '👗 Жіноче');
  await photo(uid, `photo-${title}`);
  await text(uid, '✅ Готово');
  await text(uid, title);
  await text(uid, '450');
  await text(uid, 'M');
  await text(uid, '8/10');
}

// ── 2 · without shipping, and city is required ───────────────────────────────
let plainId;
{
  tgCalls = [];
  await wizardToCity(SELLER, 'Сукня літня');
  let s = await sessionOf(SELLER);
  check(s && s.step === 'city', `wizard: after condition the step is ${s && s.step}, want city`);
  const ask = lastTo(SELLER);
  const kb = kbOf(ask);
  check(kb.includes('Київ') && kb.includes('Львів') && kb.includes('Івано-Франківськ') && kb.length === 11, `city step: want the 11 cities as buttons, got ${JSON.stringify(kb)}`);
  check(!kb.includes('➡️ Пропустити'), 'city step offers «Пропустити» — city is required');
  for (const bad of ['➡️ Пропустити', 'Москва', 'Kyiv', 'м. Київ']) {
    await text(SELLER, bad);
    s = await sessionOf(SELLER);
    check(s && s.step === 'city' && !s.data.city, `city step: "${bad}" was accepted (step ${s && s.step}, city ${s && s.data.city})`);
  }
  await text(SELLER, 'Київ');
  s = await sessionOf(SELLER);
  check(s && s.step === 'area' && s.data.city === 'kyiv', `city step: Київ did not advance to area (${s && s.step} / ${s && s.data.city})`);
  check((await VISITS.get(`market-prefs:${SELLER}`, { type: 'json' }) || {}).city === 'kyiv', 'the seller’s city was not remembered for the buyer side');
  await text(SELLER, 'Оболонь');
  s = await sessionOf(SELLER);
  check(s && s.step === 'ships', `after area the step is ${s && s.step}, want ships`);
  await text(SELLER, 'можливо');
  check((await sessionOf(SELLER)).step === 'ships', 'ships step accepted free text');
  await text(SELLER, '🤝 Ні, лише особисто');
  s = await sessionOf(SELLER);
  check(s && s.step === 'confirm' && s.data.ships === false, `no-shipping answer did not go to confirm (${s && s.step})`);
  const preview = [...tgCalls].reverse().find((c) => c.method === 'sendPhoto' && String(c.body.chat_id) === String(SELLER));
  check(preview && preview.body.caption.includes('📍 Київ, Оболонь') && !preview.body.caption.includes('📦'), `preview without shipping is wrong: ${preview && preview.body.caption}`);
  tgCalls = [];
  await text(SELLER, '📮 Опублікувати');
  const mod = tgCalls.find((c) => c.method === 'sendPhoto' && String(c.body.chat_id) === OWNER);
  check(mod, 'no moderation message to the owner');
  plainId = mod && /#([a-f0-9-]+)/.exec(mod.body.caption)[1];
  const r = row('SELECT * FROM listings WHERE id = ?', plainId);
  check(r && r.city === 'kyiv' && r.ships_nationwide === 0 && r.carriers === null && r.cod === null && r.area === 'Оболонь', `stored no-shipping row is wrong: ${JSON.stringify(r)}`);
  check(mod.body.caption.includes('📍 Київ, Оболонь'), 'moderation message lacks the city line');
  check(!mod.body.caption.includes('📦') && !mod.body.caption.includes('🛡'), 'moderation message for a no-shipping listing mentions shipping');
  check(mod.body.caption.includes('🧾 Продано: 0 · 🆕 новий продавець'), `moderation message lacks the trust line: ${mod.body.caption}`);
  check(mod.body.caption.includes('ми не беремо участі в угоді'), 'the disclaimer is gone');
  dumps.push(['Moderation message — no shipping', mod.body.caption]);

  // The Worker is the boundary: no city, an unknown city, or shipping with no
  // carrier is refused whatever the caller is.
  const base = { seller_id: '9', seller_username: 'x', category: 'women', title: 'T', price_uah: 1, photo_ids: ['p'] };
  const noCity = await api('/api/listing/create', base);
  check(noCity.ok === false && noCity.reason === 'bad_city', `create without a city: ${JSON.stringify(noCity)}`);
  const badCity = await api('/api/listing/create', { ...base, city: 'moscow' });
  check(badCity.ok === false && badCity.reason === 'bad_city', `create with an unknown city: ${JSON.stringify(badCity)}`);
  const noCarrier = await api('/api/listing/create', { ...base, city: 'kyiv', ships_nationwide: 1, carriers: ['dhl'] });
  check(noCarrier.ok === false && noCarrier.reason === 'no_carriers', `create shipping with no valid carrier: ${JSON.stringify(noCarrier)}`);
  console.log('wizard without shipping: city required (buttons only, Worker refuses none/unknown), stored and shown');
}

// ── 3 · with shipping ────────────────────────────────────────────────────────
let shipId;
{
  tgCalls = [];
  await wizardToCity(SELLER, 'Куртка зимова');
  // The remembered city is offered first.
  check(kbOf(lastTo(SELLER))[0] === 'Київ', `the remembered city is not the first button: ${kbOf(lastTo(SELLER))[0]}`);
  await text(SELLER, 'Львів');
  await text(SELLER, '➡️ Пропустити');
  await text(SELLER, '📦 Так, відправлю');
  let s = await sessionOf(SELLER);
  check(s && s.step === 'carriers', `shipping yes → step ${s && s.step}, want carriers`);
  await text(SELLER, '✅ Готово');
  check((await sessionOf(SELLER)).step === 'carriers', 'carriers: «Готово» with none picked advanced');
  await text(SELLER, '⬜ Нова Пошта');
  await text(SELLER, '⬜ Укрпошта');
  await text(SELLER, '☑️ Укрпошта'); // untick
  await text(SELLER, '⬜ Meest');
  s = await sessionOf(SELLER);
  check(JSON.stringify(s.data.carriers) === JSON.stringify(['novaposhta', 'meest']), `carriers toggle: ${JSON.stringify(s.data.carriers)}`);
  check(kbOf(lastTo(SELLER)).includes('☑️ Нова Пошта') && kbOf(lastTo(SELLER)).includes('⬜ Укрпошта'), `carriers keyboard does not show the ticks: ${kbOf(lastTo(SELLER))}`);
  await text(SELLER, '✅ Готово');
  check((await sessionOf(SELLER)).step === 'cod', 'carriers → cod did not happen');
  await text(SELLER, '✅ Так, накладений платіж');
  s = await sessionOf(SELLER);
  check(s.step === 'confirm' && s.data.cod === true, `cod → confirm: ${s.step} / ${s.data.cod}`);
  tgCalls = [];
  await text(SELLER, '📮 Опублікувати');
  const mod = tgCalls.find((c) => c.method === 'sendPhoto' && String(c.body.chat_id) === OWNER);
  shipId = /#([a-f0-9-]+)/.exec(mod.body.caption)[1];
  const r = row('SELECT * FROM listings WHERE id = ?', shipId);
  check(r.city === 'lviv' && r.ships_nationwide === 1 && r.carriers === '["novaposhta","meest"]' && r.cod === 1 && r.area === null, `stored shipping row is wrong: ${JSON.stringify(r)}`);
  const cap = mod.body.caption;
  check(cap.includes('📍 Львів\n'), `moderation: city line without an area should be just the city: ${cap}`);
  check(cap.includes('📦 Відправка по Україні · Нова Пошта, Meest · накладений платіж ✓'), `moderation: shipping line wrong: ${cap}`);
  check(cap.includes('🛡 Як не натрапити на шахраїв: https://www.lvivsecondhand.com/market/bezpeka.html?src=tgch'), `moderation: safety link missing: ${cap}`);
  check(cap.includes('#жіноче #львів #доставка'), `moderation: hashtags wrong: ${cap}`);
  dumps.push(['Moderation message — with shipping', cap]);

  // Approve both. The published post is the moderation card minus the header,
  // with the complaint button.
  for (const [id, label] of [[plainId, 'no shipping'], [shipId, 'with shipping']]) {
    // Exactly what the owner was sent, header included.
    const modMsg = { message_id: 55, chat: { id: Number(OWNER) }, caption: id === shipId ? cap : dumps[0][1], photo: [{ file_id: 'p' }] };
    tgCalls = [];
    await callback(OWNER, `sell:ok:${id}`, modMsg);
    const post = tgCalls.find((c) => c.method === 'sendPhoto' && c.body.chat_id === '@Test_Channel');
    check(post, `approve (${label}): nothing posted to the channel`);
    check(post && JSON.stringify(post.body.reply_markup) === JSON.stringify({ inline_keyboard: [[{ text: '⚠️ Поскаржитись', callback_data: `rep:${id}` }]] }), `approve (${label}): no report button: ${JSON.stringify(post && post.body.reply_markup)}`);
    check(post && !post.body.caption.includes('🆕 Нове оголошення'), `approve (${label}): internal header leaked`);
    check(row('SELECT status FROM listings WHERE id = ?', id).status === 'live', `approve (${label}): not live`);
    dumps.push([`Published channel post — ${label}`, post.body.caption + '\n[ ⚠️ Поскаржитись ]']);
  }
  console.log('wizard with shipping: carriers multi-select (≥1), COD; moderation + post show city/shipping/safety/trust; post has «Поскаржитись»');
}

// ── 4 · buyer filters ────────────────────────────────────────────────────────
{
  // A few more listings across cities, made through the Worker.
  const make = async (seller, city, ships) => {
    const out = await api('/api/listing/create', { seller_id: seller, seller_username: 'u' + seller, category: 'men', title: `${city} ${ships ? 'ship' : 'local'}`, price_uah: 100, photo_ids: ['p'], city, ships_nationwide: ships ? 1 : 0, carriers: ships ? ['ukrposhta'] : null, cod: ships ? 0 : null });
    await api('/api/listing/status', { id: out.id, status: 'live', channel_msg_id: 700 });
    return out.id;
  };
  const odLocal = await make('4001', 'odesa', false);
  const odShip = await make('4002', 'odesa', true);
  const kvShip = await make('4003', 'kyiv', true);
  const pending = (await api('/api/listing/create', { seller_id: '4004', seller_username: 'p', category: 'men', title: 'pending', price_uah: 1, photo_ids: ['p'], city: 'odesa' })).id;

  const kyiv = await feed('?filter=city&city=kyiv');
  check(kyiv.ok && kyiv.listings.every((l) => l.city === 'kyiv'), `city filter returned another city: ${kyiv.listings.map((l) => l.city)}`);
  check(kyiv.listings.some((l) => l.id === plainId) && kyiv.listings.some((l) => l.id === kvShip), 'city filter missed a Kyiv listing');
  const ships = await feed('?filter=ships&city=odesa');
  check(ships.ok && ships.listings.length && ships.listings.every((l) => l.ships_nationwide === true), 'ships filter returned a non-shipping listing');
  check(ships.listings[0].city === 'odesa', `ships filter: the buyer's own city should come first, got ${ships.listings[0].city}`);
  check(!ships.listings.some((l) => l.id === odLocal), 'ships filter returned a local-only listing');
  check(ships.listings.some((l) => l.id === shipId) && ships.listings.some((l) => l.id === kvShip), 'ships filter missed shipping listings from other cities');
  const everything = await feed('');
  check(!everything.listings.some((l) => l.id === pending), 'the public feed shows a pending listing');
  check(everything.listings.every((l) => !('seller_id' in l) && !('photo_ids' in l)), 'the public feed exposes seller_id or photo file ids');
  const sl = everything.listings.find((l) => l.id === shipId);
  check(sl && JSON.stringify(sl.carriers) === '["novaposhta","meest"]' && sl.cod === true, `public shape of a shipping listing: ${JSON.stringify(sl)}`);
  check((await feed('?filter=city')).ok === false && (await feed('?city=moscow')).ok === false, 'the feed accepts a missing/unknown city');

  // The bot: a buyer with no city is asked once, then remembered.
  const BUYER = 6000;
  tgCalls = [];
  await text(BUYER, '🛍 Барахолка', 'buyer');
  check(kbOf(lastTo(BUYER)).includes('🏙 Тільки моє місто') && kbOf(lastTo(BUYER)).includes('📦 З доставкою до мене'), `market menu lacks the two filters: ${kbOf(lastTo(BUYER))}`);
  await text(BUYER, '🏙 Тільки моє місто', 'buyer');
  check(/Ваше місто\?/.test(lastTo(BUYER).body.text) && kbOf(lastTo(BUYER)).length === 11, `first filter tap did not ask the city: ${lastTo(BUYER).body.text}`);
  await text(BUYER, 'Одеса', 'buyer');
  let list = lastTo(BUYER).body.text;
  check(list.includes('Барахолка · Одеса') && list.includes('odesa local') && list.includes('odesa ship') && !list.includes('kyiv'), `«Тільки моє місто» (Одеса) listed: ${list}`);
  check(list.includes('https://t.me/Test_Channel/700'), 'results do not link the channel posts');
  check((await VISITS.get(`market-prefs:${BUYER}`, { type: 'json' })).city === 'odesa', 'buyer city not remembered');
  tgCalls = [];
  await text(BUYER, '📦 З доставкою до мене', 'buyer');
  list = lastTo(BUYER).body.text;
  check(!/Ваше місто\?/.test(list), 'the city was asked again although it is remembered');
  check(list.includes('odesa ship') && list.includes('Куртка зимова') && !list.includes('odesa local'), `«З доставкою до мене» listed: ${list}`);
  check(list.indexOf('odesa ship') < list.indexOf('Куртка зимова'), 'own-city shipping listings should come first');
  await text(BUYER, '/city', 'buyer');
  await text(BUYER, 'Львів', 'buyer');
  check((await VISITS.get(`market-prefs:${BUYER}`, { type: 'json' })).city === 'lviv', '/city did not change the remembered city');
  console.log('filters: city / ships in the feed and the bot; hidden fields stay private; city asked once, changeable with /city');
}

// ── 5 · complaints ───────────────────────────────────────────────────────────
{
  const id = shipId;
  const channelPost = { message_id: 777, chat: { id: -100 } };
  const tap = async (uid) => { tgCalls = []; await callback(uid, `rep:${id}`, channelPost); return tgCalls.find((c) => c.method === 'answerCallbackQuery'); };
  const ownerMsgs = () => tgCalls.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === OWNER);

  let a = await tap(7001);
  check(a && a.body.show_alert && /Скаргу передано/.test(a.body.text), `first report answer: ${a && a.body.text}`);
  check(ownerMsgs().some((m) => m.body.text.includes(`Скарга на #${id} (1/3)`)), 'first report was not forwarded to the admin');
  a = await tap(7001);
  check(/вже поскаржилися/.test(a.body.text), `repeat report answer: ${a.body.text}`);
  check(!ownerMsgs().length, 'a repeat report was forwarded again');
  a = await tap(SELLER);
  check(/ваше оголошення/i.test(a.body.text), `seller self-report answer: ${a.body.text}`);
  await tap(7002);
  check(row('SELECT status FROM listings WHERE id = ?', id).status === 'live', 'two distinct reports (plus a repeat and the seller) already hid the listing');
  check(row('SELECT COUNT(*) AS n FROM listing_reports WHERE listing_id = ?', id).n === 2, 'report rows: want exactly 2 distinct');

  // The site's link goes through /start rep_<id> — same vote, Telegram identity.
  tgCalls = [];
  await text(7003, `/start rep_${id}`, 'reporter3');
  check(/Скаргу передано/.test(lastTo(7003).body.text), `deep-link report answer: ${lastTo(7003) && lastTo(7003).body.text}`);
  check(row('SELECT status FROM listings WHERE id = ?', id).status === 'hidden', 'the third distinct report did not hide the listing');
  const blank = tgCalls.find((c) => c.method === 'editMessageCaption' && c.body.chat_id === '@Test_Channel');
  check(blank && /приховано/.test(blank.body.caption) && !blank.body.caption.includes('@seller_test') && !blank.body.reply_markup, `the channel post was not blanked: ${JSON.stringify(blank && blank.body)}`);
  const review = ownerMsgs().find((m) => m.body.text.startsWith(`🙈 #${id} приховано`));
  check(review && JSON.stringify(review.body.reply_markup.inline_keyboard[0].map((b) => b.callback_data)) === JSON.stringify([`sell:restore:${id}`, `sell:remove:${id}`]), 'the admin was not asked to review the hidden listing');
  check(tgCalls.some((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(SELLER) && /приховано/.test(c.body.text)), 'the seller was not told');
  check(!(await feed('')).listings.some((l) => l.id === id), 'a hidden listing is still in the public feed');
  a = await tap(7004);
  check(/не активне/.test(a.body.text), `a report on a hidden listing: ${a.body.text}`);

  // Only the admin can restore.
  tgCalls = [];
  await callback(7001, `sell:restore:${id}`, { message_id: 1, chat: { id: 7001 } });
  check(row('SELECT status FROM listings WHERE id = ?', id).status === 'hidden', 'a non-admin restored a listing');
  const before = row('SELECT expires_at FROM listings WHERE id = ?', id).expires_at;
  db.prepare('UPDATE listings SET expires_at = ? WHERE id = ?').run('2026-12-01', id);
  tgCalls = [];
  await callback(OWNER, `sell:restore:${id}`, { message_id: 2, chat: { id: Number(OWNER) } });
  const restored = row('SELECT * FROM listings WHERE id = ?', id);
  check(restored.status === 'live' && restored.expires_at === '2026-12-01' && restored.reports_cleared_at, `restore: ${JSON.stringify(restored)} (was ${before})`);
  const back = tgCalls.find((c) => c.method === 'editMessageCaption' && c.body.chat_id === '@Test_Channel');
  check(back && back.body.caption.includes('📦 Відправка по Україні · Нова Пошта, Meest · накладений платіж ✓') && back.body.reply_markup, 'restore did not put the card and the button back');
  // Reports count when created_at > reports_cleared_at, both millisecond ISO
  // strings. In-process the next report can land in the restore's own
  // millisecond and read as an older one (about 1 run in 8) — step past it.
  await new Promise((r) => setTimeout(r, 5));
  a = await tap(7005);
  check(ownerMsgs().some((m) => m.body.text.includes(`Скарга на #${id} (1/3)`)), 'after restore, older reports still count');
  check(row('SELECT status FROM listings WHERE id = ?', id).status === 'live', 'one new report after restore re-hid the listing');

  // Remove: post deleted, seller told, gone from the feed.
  tgCalls = [];
  await callback(OWNER, `sell:remove:${plainId}`, { message_id: 3, chat: { id: Number(OWNER) } });
  check(row('SELECT status FROM listings WHERE id = ?', plainId).status === 'removed', 'remove did not mark the listing');
  check(tgCalls.some((c) => c.method === 'deleteMessage' && c.body.chat_id === '@Test_Channel'), 'remove did not delete the channel post');
  console.log('complaints: distinct users only, seller excluded, 3rd hides (feed, post, admin, seller), admin-only restore resets the count, remove deletes');
}

// ── 6 · the seller trust line ────────────────────────────────────────────────
{
  const VET = '8000';
  for (let i = 0; i < 3; i++) {
    db.prepare("INSERT INTO listings (id, seller_id, seller_username, category, title, price_uah, photo_ids, status, created_at, expires_at, city) VALUES (?, ?, 'vet', 'men', 'old', 1, '[]', ?, '2026-01-01', '2026-02-01', 'kyiv')")
      .run(`vet0000${i}`, VET, i < 2 ? 'sold' : 'expired');
  }
  const out = await api('/api/listing/create', { seller_id: VET, seller_username: 'vet', category: 'men', title: 'Пальто', price_uah: 900, photo_ids: ['p'], city: 'kyiv' });
  check(out.ok && out.trust && out.trust.sold === 2 && out.trust.is_new === false, `veteran trust: ${JSON.stringify(out.trust)}`);
  const fresh = await api('/api/listing/create', { seller_id: '8001', seller_username: 'n', category: 'men', title: 'x', price_uah: 1, photo_ids: ['p'], city: 'kyiv' });
  check(fresh.trust && fresh.trust.sold === 0 && fresh.trust.is_new === true, `new seller trust: ${JSON.stringify(fresh.trust)}`);
  // Old but nothing sold is still "new" (0 sales), per the rule.
  db.prepare("UPDATE listings SET created_at = '2026-01-01' WHERE seller_id = '8001'").run();
  const again = await api('/api/listing/create', { seller_id: '8001', seller_username: 'n', category: 'men', title: 'y', price_uah: 1, photo_ids: ['p'], city: 'kyiv' });
  check(again.trust.is_new === true, '0 sales should still read as a new seller');
  console.log('trust: sold count, new = first listing < 30 days or 0 sold');
}

// ── the old listing still renders when the seller marks it sold ──────────────
{
  tgCalls = [];
  await callback(OLD_SELLER, 'sold:0ld00001', { message_id: 9, chat: { id: Number(OLD_SELLER) } });
  const edit = tgCalls.find((c) => c.method === 'editMessageCaption');
  check(edit && edit.body.caption.startsWith('🔴 ПРОДАНО') && edit.body.caption.includes('📍 Львів, Сихів, самовивіз') && !edit.body.caption.includes('📦'), `an old listing's sold card: ${edit && edit.body.caption}`);
  console.log('old listing: rebuilt card reads Львів, no shipping');
}

if (DUMP) {
  for (const [label, body] of dumps) console.log(`\n──── ${label} ────\n${body}`);
}
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log('\nMarket shipping OK.');
