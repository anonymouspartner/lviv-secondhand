// The bot's schedule commands follow the person's city (docs/TELEGRAM_BOT.md,
// "Cities").
//
// /today, /day, /rare and /cheap used to read the Lviv store list whatever
// city the person had picked with /city — 136 stores with a restock day in ten
// other cities were unreachable from the bot. Drives the real webhook handler
// (only Telegram and KV are stubbed) and asserts:
//
//   1. with no city picked, every schedule reply is Lviv's, as before, and
//      says how to change the city;
//   2. «🏙 Змінити місто» on the main menu asks the city, remembers it, and
//      comes back to the main menu;
//   3. after that, each schedule command lists only that city's stores, links
//      them on that city's host, names the city, and labels imported
//      (verified: false) schedules as unconfirmed — Lviv's never are;
//   4. every city with a restock day on record can be reached this way;
//   5. Lviv ids stay Lviv-only where the bot acts on a store (the sponsored
//      slot never shows outside Lviv).
//
//   node --no-warnings scripts/check-bot-cities.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

let tgCalls = [];
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(\w+)/);
  if (m) {
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}
    tgCalls.push({ method: m[1], body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  }
  return new Response('{}', { status: 404 });
};

execFileSync(process.execPath, ['build-data.mjs'], { cwd: join(ROOT, 'telegram-bot'), stdio: 'ignore' });
const bot = (await import('../telegram-bot/worker.js')).default;
const CITIES = JSON.parse(readFileSync(join(ROOT, 'cities.json'), 'utf8'));
const storesOf = (c) => JSON.parse(readFileSync(join(ROOT, c.stores), 'utf8')).filter((s) => !s.watermark);

const kv = new Map();
const VISITS = {
  async get(k, o) { const v = kv.get(k); if (v == null) return null; return o && o.type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [], list_complete: true }; },
};
const env = { WEBHOOK_SECRET: 's', BOT_TOKEN: 't', OWNER_ID: '1', AGENT_IDS: '', VISITS };

// One message in; the reply out — whether the bot answered in the webhook
// response (the stateless commands) or by calling sendMessage (the flows).
async function ask(uid, t, e = env) {
  tgCalls = [];
  const pending = [];
  const res = await bot.fetch(new Request('https://bot.example/', {
    method: 'POST',
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, from: { id: uid }, chat: { id: uid, type: 'private' }, text: t } }),
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 's' },
  }), e, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  let body = null;
  try { body = await res.clone().json(); } catch {}
  if (!body || body.method !== 'sendMessage') body = (tgCalls.filter((c) => c.method === 'sendMessage').pop() || {}).body || null;
  return { text: body ? body.text : '', kb: ((body && body.reply_markup && body.reply_markup.keyboard) || []).flat().map((b) => b.text) };
}
const storeIds = (text) => [...text.matchAll(/[?&]store=([\w-]+)|\/store\/([\w-]+)\//g)].map((m) => m[1] || m[2]);
const UNCONFIRMED = 'Непідтверджений розклад';
const DAY_LABELS = { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Нд' };

// ── 1 · no city picked: Lviv, as before ──────────────────────────────────────
{
  const U = 100;
  const lvivIds = new Set(storesOf(CITIES[0]).map((s) => s.id));
  for (const cmd of ['/today', '/cheap', '/rare', '/day mon', '/day tue', '/day wed', '/day thu', '/day fri']) {
    const r = await ask(U, cmd);
    const ids = storeIds(r.text);
    check(ids.every((id) => lvivIds.has(id)), `no city, ${cmd}: a non-Lviv store listed (${ids.filter((id) => !lvivIds.has(id))})`);
    check(!r.text.includes(UNCONFIRMED), `no city, ${cmd}: Lviv schedule labelled unconfirmed`);
    check(r.text.length <= 4096, `no city, ${cmd}: reply is ${r.text.length} chars, over Telegram's 4096`);
    check(r.text.includes('Львів') && r.text.includes('/city'), `no city, ${cmd}: reply does not name the city or mention /city`);
    check(!/https:\/\/(?!www\.)[a-z-]+\.lvivsecondhand\.com/.test(r.text), `no city, ${cmd}: links off the Lviv host`);
  }
  const cheap = await ask(U, '/cheap');
  check(storeIds(cheap.text).length > 0, 'no city: /cheap lists no Lviv stores');
  const help = await ask(U, '/help');
  check(help.text.includes('/city') && help.text.includes('www.lvivsecondhand.com/?src=tgbot'), 'no city: /help lacks /city or the Lviv map link');
  check(!/stores in Lviv\./.test(help.text), '/help still says the bot is Lviv-only');
  check(help.kb.includes('🏙 Змінити місто'), `main menu has no city button: ${help.kb}`);
  // Without the stateful tier there is no city to read — still answers, for Lviv.
  const bare = await ask(U, '/cheap', { WEBHOOK_SECRET: 's' });
  check(bare.text.includes('Львів') && storeIds(bare.text).every((id) => lvivIds.has(id)), 'stateless tier: /cheap is not Lviv');
  console.log('no city picked: schedule commands answer for Lviv and point at /city');
}

// ── 2–4 · every other city ───────────────────────────────────────────────────
let uid = 200;
for (const city of CITIES.slice(1)) {
  uid++;
  const stores = storesOf(city);
  const ids = new Set(stores.map((s) => s.id));
  const withDay = stores.filter((s) => s.restockDay);

  // Pick the city from the main menu.
  const q = await ask(uid, '🏙 Змінити місто');
  check(q.kb.includes(city.nameUa), `${city.slug}: city question has no «${city.nameUa}» button (${q.kb})`);
  const a = await ask(uid, city.nameUa);
  check(a.text.includes(city.nameUa), `${city.slug}: no confirmation of the city: ${a.text}`);
  check(a.kb.includes('📅 За днем тижня') && a.kb.includes('🏙 Змінити місто'), `${city.slug}: city answer did not return to the main menu (${a.kb})`);
  check((await VISITS.get(`market-prefs:${uid}`, { type: 'json' })).city === city.slug, `${city.slug}: city not remembered`);

  // /day <weekday> lists exactly the stores with that restock day.
  const seen = new Set();
  for (const d of Object.keys(DAY_LABELS)) {
    const want = stores.filter((s) => s.restockDay === d).map((s) => s.id).sort();
    for (const how of [`/day ${d}`, DAY_LABELS[d]]) {
      const r = await ask(uid, how);
      const got = storeIds(r.text).sort();
      // Long lists are cut at 16 and the rest sent to the map (the 4096 limit).
      check(JSON.stringify(got) === JSON.stringify(want.length > 16 ? [...stores.filter((s) => s.restockDay === d).slice(0, 16).map((s) => s.id)].sort() : want), `${city.slug} ${how}: listed ${got}, want ${want}`);
      check(r.text.includes(city.nameUa), `${city.slug} ${how}: reply does not name the city`);
      check(r.text.length <= 4096, `${city.slug} ${how}: reply is ${r.text.length} chars, over Telegram's 4096`);
      if (got.length) {
        check(r.text.includes(`https://${city.host}/?store=`), `${city.slug} ${how}: store links are not on ${city.host}`);
        check(!r.text.includes('www.lvivsecondhand.com'), `${city.slug} ${how}: a link points at the Lviv site`);
        const unv = stores.some((s) => want.includes(s.id) && s.verified === false);
        check(r.text.includes(UNCONFIRMED) === unv, `${city.slug} ${how}: unconfirmed label ${unv ? 'missing' : 'shown for verified stores'}`);
      }
      check(!r.text.includes('Реклама · Sponsored'), `${city.slug} ${how}: Lviv sponsored slot shown`);
      got.forEach((id) => seen.add(id));
    }
  }
  check(seen.size === withDay.length || withDay.length > 16 * 7, `${city.slug}: ${seen.size} of ${withDay.length} scheduled stores reachable through /day`);

  // The day buttons, /today, /cheap, /rare and /help all follow the city too.
  const btn = await ask(uid, '📅 За днем тижня');
  check(btn.text.includes(city.nameUa), `${city.slug}: day picker does not name the city`);
  for (const cmd of ['/today', '/cheap', '🕒 Найдовше без завозу', '/rare']) {
    const r = await ask(uid, cmd);
    const got = storeIds(r.text);
    check(got.every((id) => ids.has(id)), `${city.slug} ${cmd}: a store from another city listed (${got.filter((id) => !ids.has(id))})`);
    check(r.text.includes(city.nameUa) && r.text.includes('/city'), `${city.slug} ${cmd}: reply does not name the city or mention /city`);
    check(!r.text.includes('www.lvivsecondhand.com'), `${city.slug} ${cmd}: a link points at the Lviv site`);
    check(r.text.length <= 4096, `${city.slug} ${cmd}: reply is ${r.text.length} chars, over Telegram's 4096`);
    if (cmd === '/cheap' && withDay.length) check(got.length > 0, `${city.slug} /cheap: lists nothing though ${withDay.length} stores have a restock day`);
  }
  const help = await ask(uid, '/help');
  check(help.text.includes(`https://${city.host}/?src=tgbot`) && help.text.includes(city.nameUa), `${city.slug}: /help map link or city name is not this city's`);
  console.log(`${city.slug}: ${withDay.length} scheduled stores reachable, linked on ${city.host}`);
}

// Changing back to Lviv restores Lviv answers.
{
  await ask(uid, '/city');
  await ask(uid, 'Львів');
  const r = await ask(uid, '/cheap');
  check(r.text.includes('Львів') && !r.text.includes(UNCONFIRMED), 'back to Lviv: /cheap is not Lviv again');
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nBot schedule commands follow the city: OK');
