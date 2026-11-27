// The field-agent role is open in every city in cities.json
// (docs/FIELD_AGENT.md, "Міста").
//
// /visit, /route and the application used to know Lviv's stores only: an agent
// standing in Kyiv was offered the "nearest" shops 470 km away. Drives the
// real webhook handler (Telegram and KV stubbed) and asserts:
//
//   1. /apply asks the city first (buttons), remembers it, and the owner's
//      copy of the application names it; /job lists the cities;
//   2. /visit reads the city off the GPS point: only that city's stores are
//      offered, the map link is on that city's host, a name search stays in
//      the city, and a point far from every city is refused;
//   3. a picked store from another city is claimed and reaches the photo step;
//   4. the /route selection map lists the stores of the agent's /city, and a
//      submitted route links to that city's map;
//   5. Lviv agents see what they always did.
//
//   node --no-warnings scripts/check-agent-cities.mjs
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
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
    return new Response(JSON.stringify({ ok: true, result: { message_id: tgCalls.length } }));
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
const OWNER = '1', AGENT = 42, TOKEN = 'test:TOKEN';
const env = { WEBHOOK_SECRET: 's', BOT_TOKEN: TOKEN, OWNER_ID: OWNER, AGENT_IDS: String(AGENT), VISITS };

async function post(uid, message) {
  tgCalls = [];
  const pending = [];
  const res = await bot.fetch(new Request('https://bot.example/', {
    method: 'POST',
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, from: { id: uid, first_name: 'Тест', username: 'tester' }, chat: { id: uid, type: 'private' }, ...message } }),
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 's' },
  }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  let inline = null;
  try { inline = await res.clone().json(); } catch {}
  const sent = tgCalls.filter((c) => c.method === 'sendMessage').map((c) => c.body);
  if (inline && inline.method === 'sendMessage') sent.push(inline);
  const to = (chat) => sent.filter((b) => String(b.chat_id) === String(chat)).pop() || { text: '' };
  return { mine: to(uid), owner: to(OWNER) };
}
const say = (uid, text) => post(uid, { text });
const locate = (uid, lat, lng) => post(uid, { location: { latitude: lat, longitude: lng } });
const kbOf = (b) => ((b.reply_markup && b.reply_markup.keyboard) || []).flat().map((x) => x.text || x);
const session = (uid) => VISITS.get(`session:${uid}`, { type: 'json' });

// ── 1 · applying ─────────────────────────────────────────────────────────────
{
  const U = 500;
  const job = await say(U, '/job');
  for (const c of CITIES) check(job.mine.text.includes(c.nameUa), `/job does not list ${c.nameUa}`);
  const q = await say(U, '/apply');
  for (const c of CITIES) check(kbOf(q.mine).includes(c.nameUa), `/apply: no «${c.nameUa}» button`);
  const a = await say(U, 'Харків');
  check(/Харків/.test(a.mine.text) && /GPS/.test(a.mine.text), `/apply: city answer did not lead to the text step: ${a.mine.text}`);
  check((await VISITS.get('market-prefs:500', { type: 'json' })).city === 'kharkiv', '/apply: city not remembered');
  const done = await say(U, 'Можу у вихідні, телефон з GPS є.');
  check(/Заявку надіслано/.test(done.mine.text), `/apply: no confirmation: ${done.mine.text}`);
  check(done.owner.text.includes('Харків') && done.owner.text.includes('Kharkiv') && done.owner.text.includes('500') && done.owner.text.includes('Можу у вихідні'), `/apply: the owner's copy lacks the city, the id or the text: ${done.owner.text}`);
  // Free text instead of a city button ends the application, never files it.
  await say(501, '/apply');
  const bad = await say(501, 'Я з Полтави');
  check(/\/apply/.test(bad.mine.text) && !bad.owner.text, '/apply: free text at the city step was not turned away');
  const after = await say(501, 'ще текст');
  check(!after.owner.text, '/apply: text after a cancelled application reached the owner');
  // The public job page and the handbook name every city too.
  const page = readFileSync(join(ROOT, 'jobs/index.html'), 'utf8');
  const book = readFileSync(join(ROOT, 'docs/FIELD_AGENT.md'), 'utf8');
  for (const c of CITIES) {
    check(page.includes(c.nameUa), `jobs/index.html does not list ${c.nameUa}`);
    check(book.includes(c.nameUa), `docs/FIELD_AGENT.md does not list ${c.nameUa}`);
  }
  check(page.includes(`${CITIES.length} міст України`), 'jobs/index.html city count is stale');
  console.log('apply: city asked first, remembered, shown to the owner; /job lists every city');
}

// ── 2–3 · /visit in every city ───────────────────────────────────────────────
for (const city of CITIES) {
  kv.delete(`session:${AGENT}`);
  for (const k of [...kv.keys()]) if (k.startsWith('claim:')) kv.delete(k);
  const stores = storesOf(city);
  const ids = new Set(stores.map((s) => s.id));
  await say(AGENT, '/visit');
  const anchor = stores.find((s) => typeof s.lat === 'number');
  const list = await locate(AGENT, anchor.lat + 0.0005, anchor.lng);
  const s1 = await session(AGENT);
  check(s1 && s1.step === 'store' && s1.data.city === city.slug, `${city.slug}: /visit did not read the city off the GPS point (${s1 && s1.data.city})`);
  const near = (s1 && s1.data.nearby) || [];
  check(near.length > 0 && near.every((s) => ids.has(s.id)), `${city.slug}: /visit offered stores from another city (${near.map((s) => s.id)})`);
  check(near[0] && near[0].id === anchor.id, `${city.slug}: the store the agent is standing at is not first (${near[0] && near[0].id}, want ${anchor.id})`);
  check(list.mine.text.includes(city.nameUa), `${city.slug}: the store list does not name the city`);
  check(list.mine.text.includes(`https://${city.host}/?route=`), `${city.slug}: the map link is not on ${city.host}: ${list.mine.text.match(/https:[^"]+route[^"]+/)}`);
  check(list.mine.text.length <= 4096, `${city.slug}: store list is ${list.mine.text.length} chars`);

  // A name search stays inside the city: another city's id finds nothing.
  const other = CITIES.find((c) => c.slug !== city.slug);
  const foreign = await say(AGENT, storesOf(other)[0].id);
  check(/Не знайдено/.test(foreign.mine.text), `${city.slug}: a ${other.slug} store id matched from ${city.slug}`);
  // …and this city's own id picks the store.
  const pick = await say(AGENT, anchor.id);
  const s2 = await session(AGENT);
  check(s2 && s2.step === 'photo' && s2.data.store.id === anchor.id, `${city.slug}: picking ${anchor.id} did not reach the photo step: ${pick.mine.text}`);
  check(kv.has(`claim:${anchor.id}`), `${city.slug}: ${anchor.id} was not claimed`);
  console.log(`${city.slug}: /visit offers ${near.length} local stores, links ${city.host}, picks ${anchor.id}`);
}

// Nowhere near a mapped city (Poltava): refused, nothing offered.
{
  kv.delete(`session:${AGENT}`);
  await say(AGENT, '/visit');
  const far = await locate(AGENT, 49.5883, 34.5514);
  const s = await session(AGENT);
  check(/від найближчого міста/.test(far.mine.text) && s.step === 'location' && !s.data.nearby, `far from every city: ${far.mine.text}`);
  console.log('visit: a location far from every mapped city is refused');
}

// ── 4 · the /route selection map ─────────────────────────────────────────────
{
  const initData = (uid) => {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: uid }) };
    const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
    const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(TOKEN).digest()).update(dcs).digest('hex');
    return new URLSearchParams({ ...fields, hash }).toString();
  };
  const data = async () => (await bot.fetch(new Request('https://bot.example/route-map/data', { headers: { 'X-Telegram-Init-Data': initData(AGENT) } }), env, { waitUntil() {} })).json();
  for (const k of [...kv.keys()]) if (k.startsWith('claim:')) kv.delete(k);
  kv.delete(`market-prefs:${AGENT}`);
  const lviv = await data();
  const lvivIds = new Set(storesOf(CITIES[0]).map((s) => s.id));
  check(lviv.ok && lviv.stores.length > 100 && lviv.stores.every((s) => lvivIds.has(s.id)), 'route map with no /city is not Lviv');

  const dnipro = CITIES.find((c) => c.slug === 'dnipro');
  await VISITS.put(`market-prefs:${AGENT}`, JSON.stringify({ city: 'dnipro' }));
  const d = await data();
  const dIds = new Set(storesOf(dnipro).map((s) => s.id));
  check(d.ok && d.stores.length === dIds.size && d.stores.every((s) => dIds.has(s.id)), `route map for /city Dnipro lists ${d.stores && d.stores.length} stores, want ${dIds.size} Dnipro ones`);
  const cmd = await say(AGENT, '/route');
  check(cmd.mine.text.includes('Дніпро') && cmd.mine.text.includes('/city'), `/route does not name the city: ${cmd.mine.text}`);

  tgCalls = [];
  const pickIds = d.stores.slice(0, 3).map((s) => s.id);
  const sub = await (await bot.fetch(new Request('https://bot.example/route-map/submit', { method: 'POST', body: JSON.stringify({ initData: initData(AGENT), storeIds: pickIds }) }), env, { waitUntil() {} })).json();
  const routeMsg = tgCalls.find((c) => c.method === 'sendMessage');
  check(sub.ok && sub.claimed === 3, `route submit: ${JSON.stringify(sub)}`);
  check(routeMsg && decodeURIComponent(routeMsg.body.text).includes(`https://${dnipro.host}/?route=${pickIds.join(',')}`), `route message does not link the Dnipro map: ${routeMsg && routeMsg.body.text.match(/https:[^"]+route[^"]+/)}`);
  console.log('route: the selection map follows /city; a submitted route links that city\'s map');
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nField-agent flows work in every city: OK');
