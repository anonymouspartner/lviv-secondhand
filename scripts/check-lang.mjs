// Барахолка language rule — listings in Ukrainian or English, never Russian
// (docs/MARKET.md rule 8).
//
// The first real listing, #aca62f28 "Детские ботинки Джек Вулфскин 34 размер",
// was Russian, contained none of ы э ъ ё, and was published to the channel and
// Instagram. This pins:
//   1. the detector (telegram-bot/lang-check.mjs), both directions — including
//      Ukrainian that happens to use none of і ї є ґ, which is where a careless
//      word list would start refusing real sellers;
//   2. the /sell wizard, driven through the bot's real webhook handler: a
//      Russian title or area does not advance the step and the same question is
//      asked again; Ukrainian and English go through;
//   3. the owner's ✅: a Russian card is not posted, the owner is told, and the
//      buttons stay so ❌ still works; a Ukrainian card still posts.
//   node --no-warnings scripts/check-lang.mjs
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const { detectLang, listingLang, RU_REFUSAL } = await import('../telegram-bot/lang-check.mjs');

// ── 1 · the detector ─────────────────────────────────────────────────────────
const RU = [
  'Детские ботинки Джек Вулфскин 34 размер', // #aca62f28 — no ы э ъ ё at all
  'Детские ботинки',
  'Размер 34',
  'Женская куртка',
  'Мужские брюки',
  'Платье летнее',
  'Почти новая, отличное состояние',
  'Очень тёплая куртка',               // ё
  'Джинсы Levi\'s',                    // ы
  'Самовывоз Сихов',                   // ы
  'Кроссовки Nike 42',
  'Цена 300',
  'ДЕТСКИЕ БОТИНКИ',                   // case
  'Подъезд 3',                          // ъ
  'Этаж 2',                             // э
];
const OK = [
  'Дитячі черевики 34 розмір',
  'Куртка зимова',
  'Сукня літня M',
  'Сихів, самовивіз',
  'Хороший стан, торг',                 // Ukrainian with no і ї є ґ, shares хороший/торг with Russian
  'Продам куртку',                      // продам is Ukrainian too
  'Сумка шкіряна',
  'Нова куртка Zara',
  'Кофта вовняна',
  'Пальто',
  'Jack Wolfskin kids boots, size 34',  // English
  'Levi\'s 501 W32 L34',                // Latin brand
  'Nike Air Max 42',
  '34',
  '',
  'Ґудзики, 10 шт',
];
for (const t of RU) check(detectLang(t) === 'ru', `detectLang should be "ru": ${JSON.stringify(t)}`);
for (const t of OK) check(detectLang(t) === 'ok', `detectLang should be "ok": ${JSON.stringify(t)}`);
check(listingLang({ title: 'Детские ботинки', area: 'Сихів' }) === 'ru', 'a Russian title must not pass on a Ukrainian area');
check(listingLang({ title: 'Дитячі черевики', area: 'Самовывоз' }) === 'ru', 'a Russian area must be caught');
check(listingLang({ title: 'Дитячі черевики', area: '' }) === 'ok', 'a Ukrainian listing with no area is ok');
console.log(`detector: ${RU.length} Russian and ${OK.length} Ukrainian/English/neutral examples`);

// ── 2 + 3 · the bot, through its real webhook handler ────────────────────────
execFileSync(process.execPath, ['build-data.mjs'], { cwd: join(ROOT, 'telegram-bot'), stdio: 'ignore' });
const bot = (await import('../telegram-bot/worker.js')).default;

const OWNER = '1000';
const SELLER = 2000; // not the owner, not an agent: only the /sell flow applies
const kv = new Map();
const VISITS = {
  async get(k, o) { const v = kv.get(k); if (v == null) return null; return o && o.type === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { kv.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  async delete(k) { kv.delete(k); },
  async list() { return { keys: [], list_complete: true }; },
};
let tgCalls = [];
let metricsCalls = [];
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(\w+)/);
  if (m) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    tgCalls.push({ method: m[1], body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }));
  }
  return new Response('{}', { status: 404 });
};
const METRICS = {
  async fetch(req) {
    const r = req instanceof Request ? req : new Request(req);
    const body = await r.text();
    metricsCalls.push({ path: new URL(r.url).pathname, body });
    return new Response(JSON.stringify({ ok: true, listing: { seller_id: String(SELLER), title: 'x', ig_ok: 0 } }), { headers: { 'Content-Type': 'application/json' } });
  },
};
const env = { WEBHOOK_SECRET: 's', BOT_TOKEN: 't', OWNER_ID: OWNER, AGENT_IDS: '', VISITS, METRICS, TG_CHANNEL: '@Test_Channel', ADMIN_KEY: 'k' };
const send = async (update) => {
  const pending = [];
  const res = await bot.fetch(new Request('https://bot.example/', {
    method: 'POST', body: JSON.stringify(update),
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 's' },
  }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};
const text = (t) => send({ update_id: 1, message: { message_id: 1, from: { id: SELLER, username: 'seller_test' }, chat: { id: SELLER, type: 'private' }, text: t } });
const session = async () => VISITS.get(`sell-session:${SELLER}`, { type: 'json' });
const seed = (step, data) => kv.set(`sell-session:${SELLER}`, JSON.stringify({ step, data: { category: 'kids', photos: ['photo-file-id'], ...data } }));
const lastSay = () => [...tgCalls].reverse().find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(SELLER));

// The /sell intro states the rule.
{
  kv.clear(); tgCalls = [];
  await text('/sell');
  const say = lastSay();
  check(say && say.body.text.includes('Мова оголошень — українська або англійська.'), `/sell intro does not state the language rule: ${say && say.body.text}`);
}
// Title step: Russian is refused and re-asked; Ukrainian and English advance.
for (const [input, wantRu] of [['Детские ботинки Джек Вулфскин 34 размер', true], ['Женская куртка', true], ['Дитячі черевики 34 розмір', false], ['Jack Wolfskin kids boots', false]]) {
  kv.clear(); tgCalls = []; seed('title', {});
  await text(input);
  const s = await session();
  const say = lastSay();
  if (wantRu) {
    check(s && s.step === 'title', `title "${input}": step moved to ${s && s.step}, want it to stay on title`);
    check(s && s.data.title === undefined, `title "${input}": a refused title was stored`);
    check(say && say.body.text.includes('Будь ласка, напишіть оголошення українською (або англійською).') && say.body.text.includes('Please write the listing in Ukrainian or English.'), `title "${input}": refusal text missing: ${say && say.body.text}`);
    check(say && say.body.text.includes('<b>Що це?</b>'), `title "${input}": the title question is not asked again`);
  } else {
    check(s && s.step === 'price' && s.data.title === input, `title "${input}": did not advance to price (step ${s && s.step})`);
    check(!say || !say.body.text.includes('російською'), `title "${input}": refused a listing that is not Russian`);
  }
}
// Area step: same.
for (const [input, wantRu] of [['Самовывоз Сихов', true], ['Сихів, самовивіз', false]]) {
  kv.clear(); tgCalls = []; seed('area', { title: 'Куртка зимова', price: 300 });
  await text(input);
  const s = await session();
  const say = lastSay();
  if (wantRu) {
    check(s && s.step === 'area' && s.data.area === undefined, `area "${input}": step moved to ${s && s.step}`);
    check(say && say.body.text.includes('українською') && say.body.text.includes('<b>Район і як забрати?</b>'), `area "${input}": refusal or re-ask missing`);
  } else {
    check(s && s.step === 'confirm' && s.data.area === input, `area "${input}": did not advance to confirm (step ${s && s.step})`);
  }
}
console.log('wizard: Russian title/area re-asked, Ukrainian/English advance');

// Owner ✅: the second gate. The card is exactly what the wizard sent the owner
// for #aca62f28.
const card = (title) => [`🧸 ${title}`, '450 ₴', '', '📍 Сихів', 'Продає @seller_test', '', '#дитяче', '', 'Оголошення від користувача · ми не беремо участі в угоді'].join('\n');
const approve = (id, title) => send({
  update_id: 2,
  callback_query: {
    id: 'cq1', data: `sell:ok:${id}`, from: { id: Number(OWNER) },
    message: { message_id: 55, chat: { id: Number(OWNER) }, caption: `🆕 Нове оголошення #${id}\n\n${card(title)}`, photo: [{ file_id: 'photo-file-id' }] },
  },
});
{
  tgCalls = []; metricsCalls = [];
  await approve('aca62f28', 'Детские ботинки Джек Вулфскин 34 размер');
  const toChannel = tgCalls.filter((c) => c.method === 'sendPhoto' && c.body.chat_id === env.TG_CHANNEL);
  const warn = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === OWNER && c.body.text === '⚠️ Схоже на російську — не публікую #aca62f28');
  check(toChannel.length === 0, '✅ on a Russian card posted to the channel');
  check(warn, `✅ on a Russian card did not warn the owner: ${JSON.stringify(tgCalls.map((c) => c.body.text).filter(Boolean))}`);
  check(!tgCalls.some((c) => c.method === 'editMessageReplyMarkup'), '✅ on a Russian card removed the buttons — the owner must still be able to ❌');
  check(!metricsCalls.some((c) => c.path === '/api/listing/status'), '✅ on a Russian card changed the listing status');
}
{
  tgCalls = []; metricsCalls = [];
  await approve('ua000001', 'Дитячі черевики 34 розмір');
  check(tgCalls.some((c) => c.method === 'sendPhoto' && c.body.chat_id === env.TG_CHANNEL), '✅ on a Ukrainian card did not post to the channel');
  check(!tgCalls.some((c) => (c.body.text || '').includes('Схоже на російську')), '✅ on a Ukrainian card was refused as Russian');
}
console.log('approval: Russian card held (buttons kept, status untouched), Ukrainian card posted');

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`Language rule OK — "${'Детские ботинки Джек Вулфскин 34 размер'}" → ${detectLang('Детские ботинки Джек Вулфскин 34 размер')}. Refusal: ${JSON.stringify(RU_REFUSAL)}`);
