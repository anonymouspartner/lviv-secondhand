// ─────────────────────────────────────────────────────────────────────────────
// Lviv Second Hand — Telegram bot (Cloudflare Worker, webhook-based)
//
// Public commands (stateless, answered inside the webhook response — no token):
//   /start, /help — intro + command list
//   /today        — stores getting fresh stock TODAY (fixed weekly restock day)
//   /cheap        — best by-weight deals right now (late in the weekly cycle)
//   /submit       — point store owners at the web submission form
//
// Flash-deal alerts (active, needs BOT_TOKEN — no VISITS/session involved):
//   /start sub_<storeId> — deep link from the map; follow a store's paid
//                          "+ Telegram alert" flash deals (store_subs, kept
//                          on the metrics Worker's D1 — proxied over HTTP,
//                          this Worker has no D1 binding of its own)
//   /stop                — unsubscribe from every store's flash-deal alerts
//
// Crowdsourced moderation (active, needs BOT_TOKEN):
//   /start edit_<id> — claims a web-submitted correction with this chat's
//                      real identity (POST /api/edit/stash → claim on the
//                      metrics Worker); a trusted contributor's own claim
//                      auto-publishes, anyone else's goes to moderation
//   /leaderboard     — top contributors by points
//   ✅/❌ buttons on a moderator-channel edit message — isOwner/isAgent only
//
// Field-agent commands (stateful — require BOT_TOKEN + the VISITS KV binding):
//   /visit        — guided store-survey flow (store → GPS → photo → questionnaire)
//   /myvisits     — an agent's own running visit count
//   /cancel       — abort an in-progress /visit
//   /report       — OWNER only: totals, per-agent counts, estimated pay
//   /export       — OWNER only: CSV of all logged visits
//
// The survey the agent fills in is the field questionnaire from
// docs/FIELD_AGENT.md — that doc is the single source of truth for the process,
// payment scheme, and questions; keep the two in sync.
//
// Data source for the public commands: the app's curated dataset, extracted from
// stores.json at build time into stores.gen.js (see build-data.mjs). Visit records
// live in the VISITS KV namespace, keyed so they sort chronologically.
// ─────────────────────────────────────────────────────────────────────────────
import { STORES } from './stores.gen.js';
import {
  getCycleLengthKeyboard, getDayOfWeekKeyboard, getOpenTimeKeyboard, getCloseTimeKeyboard,
  getConfirmKeyboard, summaryText, sessionToUpdates,
} from './telegram-agent-keyboards.js';

const APP_URL = 'https://www.lvivsecondhand.com/';
const METRICS_WORKER_URL = 'https://lviv-metrics.lshanalytic.workers.dev';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

// Today's weekday in Lviv (Europe/Kyiv), as 'mon'..'sun'.
function kyivWeekday() {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', weekday: 'short' })
    .format(new Date())
    .toLowerCase()
    .slice(0, 3);
  return DAYS.includes(wd) ? wd : 'mon';
}

// Escape text for Telegram HTML parse mode.
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function storeLink(id) {
  return APP_URL + '?store=' + encodeURIComponent(id);
}

// One rendered store block (name, address, deep link into the app).
function storeBlock(s, extra) {
  const lines = [`🏪 <b>${esc(s.name)}</b>`];
  if (s.address) lines.push(`📍 ${esc(s.address)}`);
  if (extra) lines.push(extra);
  lines.push(`<a href="${storeLink(s.id)}">Open in the app →</a>`);
  return lines.join('\n');
}

// A store's live paid promotion, or null (auto-expires past `until`). Mirrors the
// app's activePromo(); the field is carried through by build-data.mjs.
function activePromo(s) {
  const p = s && s.promo;
  if (!p) return null;
  if (p.until) {
    const u = new Date(p.until + 'T23:59:59');
    if (isNaN(u) || u.getTime() < Date.now()) return null;
  }
  return p;
}

// Sponsored slot shown atop /today and /cheap — always clearly labelled as
// advertising. Rotates daily when several stores are featured. Empty when none.
function featuredBlock() {
  const promoted = STORES.filter((s) => activePromo(s));
  if (!promoted.length) return '';
  const s = promoted[new Date().getDate() % promoted.length];
  const p = activePromo(s);
  const extra = p.offer ? `🎁 ${esc(p.offer)}` : '⭐ Featured store · Магазин у рекламі';
  return ['⭐ <b>Реклама · Sponsored</b>', storeBlock(s, extra), '', '➖➖➖', ''].join('\n');
}

function helpText() {
  return [
    '👋 <b>Lviv Second Hand</b>',
    'Find &amp; track second-hand clothing stores in Lviv.',
    'Знаходьте та відстежуйте секонд-хенди Львова.',
    '',
    '<b>Commands</b>',
    '/today — stores restocking today · магазини із завезенням сьогодні',
    '/cheap — best by-weight deals right now · найкращі ціни на вагу',
    '/submit — add your store (for owners) · додати свій магазин',
    '/materials — print-ready flyers, stickers, poster · рекламні матеріали для друку',
    '/help — this message · ця довідка',
    '',
    `🗺️ Full map, hours &amp; price tracker: ${APP_URL}`,
  ].join('\n');
}

// Print-ready marketing assets (served by GitHub Pages under /marketing/). Handed
// back as tap-to-open links — no bot token needed. Keep in sync with tools/social/.
function materialsText() {
  const M = APP_URL + 'marketing/';
  return [
    '🖨️ <b>Рекламні матеріали · Print materials</b>',
    'Готові до друку PDF — відкрий і надрукуй. · Print-ready PDFs — open and print.',
    '',
    `📄 <a href="${M}flyer.pdf">Флаєр · Flyer</a> — A4 → 4 листівки покупцям · shopper handouts`,
    `🏷️ <a href="${M}qr-stickers.pdf">QR-наліпки · Stickers</a> — 24 шт. на аркуш · 24 per sheet`,
    `🖼️ <a href="${M}qr-poster.pdf">Плакат · Poster</a> — A4 на вітрину/стіну · in-store`,
    `💼 <a href="${M}sell-sheet.pdf">Прайс для власників · Sell-sheet</a> — пропозиція реклами · owner pitch`,
    '',
    'Друкуй наліпки на самоклейному папері A4. · Print stickers on A4 label paper.',
    `🗺️ ${APP_URL}`,
  ].join('\n');
}

function todayText() {
  const wd = kyivWeekday();
  const todays = STORES.filter((s) => s.restockDay === wd);
  if (!todays.length) {
    return featuredBlock() + [
      `📦 <b>No scheduled restocks today (${DAY_NAMES[wd]}).</b>`,
      'The tracked by-weight stores restock Mon–Fri.',
      '',
      'Try /cheap for the best by-weight deals right now, or open the full map:',
      APP_URL,
    ].join('\n');
  }
  const blocks = todays.map((s) => storeBlock(s, '🆕 Fresh stock today')).join('\n\n');
  return featuredBlock() + [
    `📦 <b>Fresh stock today (${DAY_NAMES[wd]})</b> — ${todays.length} store${todays.length > 1 ? 's' : ''}:`,
    '',
    blocks,
  ].join('\n');
}

function cheapText() {
  const idx = DAYS.indexOf(kyivWeekday());
  const scored = STORES
    .filter((s) => s.restockDay)
    .map((s) => ({ s, days: (idx - DAYS.indexOf(s.restockDay) + 7) % 7 }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 6);
  if (!scored.length) return cheapEmpty();
  const blocks = scored
    .map(({ s, days }) => {
      const label = days === 0 ? '🆕 Restocked today — full selection' : `🔥 ${days} day${days > 1 ? 's' : ''} since restock — deeper discounts`;
      return storeBlock(s, label);
    })
    .join('\n\n');
  return featuredBlock() + [
    '💸 <b>Best by-weight deals right now</b>',
    'By-weight prices drop each day after a restock, so the stores furthest into their weekly cycle have the deepest discounts today:',
    '',
    blocks,
  ].join('\n');
}

function cheapEmpty() {
  return `No by-weight stores are tracked yet. Open the full map: ${APP_URL}`;
}

// Owner-submission: point owners at the web form (compliant first-party source).
// The form opens a GitHub issue a maintainer reviews — no scraping, no bot state.
function submitText() {
  return [
    '🏪 <b>Own or manage a second-hand store?</b>',
    "Submit your store and its restock schedule for the official map — a maintainer reviews it, then it ships to everyone.",
    'Маєте або керуєте секонд-хендом? Надішліть його для офіційної карти — після перевірки він зʼявиться в застосунку.',
    '',
    `👉 <a href="${APP_URL}?owner=1">Open the submission form · Відкрити форму</a>`,
  ].join('\n');
}

// Map a public command to its reply text. Returns null for anything we don't handle.
function replyFor(text) {
  // Strip a leading /command, tolerate "/today@BotName" and trailing args.
  const m = /^\/([a-z]+)(?:@\w+)?/i.exec(text.trim());
  if (!m) return "I only understand commands. Send /help to see them.";
  switch (m[1].toLowerCase()) {
    case 'start':
    case 'help':
      return helpText();
    case 'today':
      return todayText();
    case 'cheap':
      return cheapText();
    case 'submit':
    case 'owner':
      return submitText();
    case 'materials':
    case 'print':
    case 'flyers':
      return materialsText();
    default:
      return 'Unknown command. Send /help to see what I can do.';
  }
}

// Stateless reply: answer inside the webhook HTTP response (no bot token needed).
function sendMessage(chatId, text) {
  return new Response(
    JSON.stringify({ method: 'sendMessage', chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

const ok = (body = 'ok') => new Response(body, { status: 200 });

// ─────────────────────────────────────────────────────────────────────────────
// FIELD-AGENT VISIT SUBSYSTEM
// Active Bot API calls (needs BOT_TOKEN) + per-user state in the VISITS KV
// namespace. Only enabled when both are configured; otherwise the field commands
// report that the feature is not set up and the public bot is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 6; // abandon an in-progress visit after 6h
const MATCH_LIMIT = 8; // how many candidate stores to list on an ambiguous name
const NEAR_METERS = 250; // GPS this close to the picked store's pin = "on site"

// The questionnaire, in agent order. `kb` = reply-keyboard rows (bilingual button
// labels). Keep in sync with docs/FIELD_AGENT.md.
const QUESTIONS = [
  { key: 'pricing', q: '3️⃣ Тип цін? · Pricing type?', kb: [['⚖️ Вага / By weight', '🏷️ Штука / Itemized'], ['🔀 Обидва / Both', '❓ Не знаю / Unknown']] },
  // A concrete date beats a weekday: the app's tracker works off restock_date
  // for ANY cycle length, whereas a weekday only pins down a 7-day cycle — so
  // this is asked at every store, not just the by-weight ones.
  { key: 'lastdel', q: '4️⃣ Коли був останній завіз? · When was the last delivery?\n(або дата: 13.08) · (or a date)', kb: [['Сьогодні / Today', 'Вчора / Yesterday'], ['❓ Не знаю / Unknown']] },
  { key: 'hours', q: '5️⃣ Години роботи? (напр. 10:00–20:00, або «зачинено») · Opening hours?', kb: null },
  { key: 'size', q: '6️⃣ Розмір магазину? · Store size?', kb: [['🟢 S малий/small', '🟡 M середній/medium', '🔴 L великий/large']] },
  { key: 'poster', q: '7️⃣ QR-плакат розміщено? · QR poster placed?  (💰 бонус/bonus)', kb: [['✅ Так / Yes', '❌ Ні / No']] },
  { key: 'contact', q: '8️⃣ Контакт власника + згода на карту? · Owner contact + consent to feature?  (💰 бонус/bonus)', kb: [['✅ Так / Yes', '❌ Ні / No']] },
  { key: 'notes', q: '9️⃣ Нотатки? (або «-») · Notes? (or "-")', kb: null },
];

function cfg(env) {
  return {
    enabled: Boolean(env.BOT_TOKEN && env.VISITS),
    ownerId: String(env.OWNER_ID || ''),
    agentIds: String(env.AGENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    rateVisit: Number(env.RATE_VISIT || 80),
    rateBonus: Number(env.RATE_BONUS || 200),
  };
}

// Call the Telegram Bot API actively (for the stateful flow / owner pushes).
async function tg(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json().catch(() => ({}));
}

function say(env, chatId, text, keyboard) {
  const reply_markup = keyboard
    ? { keyboard: keyboard.map((row) => row.map((t) => ({ text: t }))), resize_keyboard: true, one_time_keyboard: true }
    : { remove_keyboard: true };
  return tg(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD-SCOUT "BOUNTY" SUBSYSTEM — a short, inline-keyboard-driven alternative
// to /visit's free-text questionnaire, entered via a deep link from the map
// (?store=id&agent_mode=true in index.html → POST /api/bounty/stash on the
// metrics Worker → t.me/…?start=bounty_{token}). Session state lives in the
// same VISITS KV as /visit, under a distinct bounty-session: prefix so the two
// flows can't collide for one user. Needs BOT_TOKEN + VISITS (like /visit) plus
// BOUNTY_SECRET (must match the metrics Worker's BOUNTY_SECRET — it verifies
// the token that Worker signed) and GH_PAT (to dispatch the resulting
// patch — see scripts/patch-store.js and .github/workflows/update-map.yml).
// ─────────────────────────────────────────────────────────────────────────────

const BOUNTY_SESSION_TTL = 60 * 30; // 30 min — generous for a short keyboard flow
const bountySessionKey = (uid) => `bounty-session:${uid}`;
const getBountySession = (env, uid) => env.VISITS.get(bountySessionKey(uid), { type: 'json' });
const putBountySession = (env, uid, s) => env.VISITS.put(bountySessionKey(uid), JSON.stringify(s), { expirationTtl: BOUNTY_SESSION_TTL });
const clearBountySession = (env, uid) => env.VISITS.delete(bountySessionKey(uid));
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Verifies a token minted by the metrics Worker's /api/bounty/stash (same
// scheme: HMAC-SHA256 over "storeId.expBase36", truncated to 6 bytes so the
// whole token fits Telegram's 64-character /start deep-link payload limit).
// Returns the storeId on success, or null (bad shape, expired, or bad MAC).
async function verifyBountyToken(env, token) {
  if (!env.BOUNTY_SECRET) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [storeId, expB36, mac] = parts;
  if (!/^[a-z0-9]{1,12}$/i.test(storeId)) return null;
  const exp = parseInt(expB36, 36);
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 60000) > exp) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BOUNTY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${storeId}.${expB36}`));
  const expected = b64url(new Uint8Array(sig).slice(0, 6));
  if (expected.length !== mac.length) return null;
  let diff = 0; for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? storeId : null;
}

// Sends the confirmed { cycle, restockDay, hours } patch to the automated map
// pipeline. Mirrors scripts/patch-store.js's dispatchMapPatch(), reimplemented
// here rather than imported — that script uses node:fs to resolve paths and
// isn't portable to the Workers runtime.
async function dispatchMapPatch(env, storeId, updates) {
  if (!env.GH_PAT) throw new Error('GH_PAT not configured');
  const res = await fetch('https://api.github.com/repos/anonymouspartner/lviv-secondhand/dispatches', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lviv-secondhand-bot',
    },
    body: JSON.stringify({ event_type: 'update_map_data', client_payload: { store_id: storeId, updates } }),
  });
  if (res.status !== 204) throw new Error(`dispatch failed: ${res.status}`);
}

// `/start sub_{storeId}` — opts this chat into Telegram alerts for a store's
// paid "+ Telegram alert" flash deals (store_subs, on the metrics Worker's
// D1 — this Worker has no D1 binding, so it proxies the write over HTTP).
// Only needs BOT_TOKEN, not the full field-agent `c.enabled` gate — no
// session, no VISITS KV involved.
async function handleFlashSubStart(env, ctx) {
  if (!env.BOT_TOKEN) return false;
  const { chatId, text } = ctx;
  const m = /^\/start\s+sub_(\S+)/.exec(String(text || '').trim());
  if (!m) return false;
  const storeId = m[1];
  if (!/^[a-z0-9]{1,12}$/i.test(storeId)) return false;
  const store = STORES.find((s) => s.id === storeId);
  try {
    await fetch(`${METRICS_WORKER_URL}/api/sub`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, chatId }),
    });
  } catch (e) {}
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: `📣 Стежите за акціями <b>${esc(store ? store.name : storeId)}</b>. Напишемо, якщо буде спалах-знижка. Відписатися від усіх — /stop\n\n` +
          `📣 Following <b>${esc(store ? store.name : storeId)}</b> for flash-deal alerts. We'll message you if one goes live. Unsubscribe from all — /stop`,
    parse_mode: 'HTML',
  });
  return true;
}

// /stop — unsubscribe this chat from every store's flash-deal alerts.
async function handleStopCommand(env, ctx) {
  if (!env.BOT_TOKEN) return false;
  const { chatId, text } = ctx;
  if (!/^\/stop\b/i.test(String(text || '').trim())) return false;
  try {
    await fetch(`${METRICS_WORKER_URL}/api/unsub-all`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    });
  } catch (e) {}
  await tg(env, 'sendMessage', { chat_id: chatId, text: '🔕 Відписано від усіх акцій. · Unsubscribed from all flash-deal alerts.' });
  return true;
}

// `/start edit_{id}` — claims a web-submitted correction (see
// /api/edit/stash) with this chat's real identity, the first moment one
// exists for it. A trusted contributor's own claim auto-publishes; anyone
// else's goes to the moderator channel. Only needs BOT_TOKEN.
async function handleEditStart(env, ctx) {
  if (!env.BOT_TOKEN) return false;
  const { chatId, from, text } = ctx;
  const m = /^\/start\s+edit_(\S+)/.exec(String(text || '').trim());
  if (!m) return false;
  const name = (from && (from.first_name || from.username)) || null;
  let out = {};
  try {
    const res = await fetch(`${METRICS_WORKER_URL}/api/edit/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m[1], chatId, name }),
    });
    out = await res.json().catch(() => ({}));
  } catch (e) {}
  if (out.status === 'auto') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: `✅ Дякуємо! Вашу пропозицію одразу опубліковано (довірений редактор). +${EDIT_POINTS_LABEL} балів.\n\n✅ Thanks — published immediately (trusted editor). +${EDIT_POINTS_LABEL} points.` });
  } else if (out.status === 'pending') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '📨 Дякуємо! Пропозицію надіслано на перевірку модератору.\n\n📨 Thanks — sent to a moderator for review.' });
  } else {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Це посилання застаріле, недійсне або вже опрацьоване. · This link is expired, invalid, or already handled.' });
  }
  return true;
}
const EDIT_POINTS_LABEL = 10; // must match EDIT_POINTS in worker/worker.js — display only

// /leaderboard — top contributors by points.
async function handleLeaderboardCommand(env, ctx) {
  if (!env.BOT_TOKEN) return false;
  const { chatId, text } = ctx;
  if (!/^\/leaderboard\b/i.test(String(text || '').trim())) return false;
  let rows = [];
  try {
    const res = await fetch(`${METRICS_WORKER_URL}/api/leaderboard`);
    rows = await res.json().catch(() => []);
  } catch (e) {}
  if (!Array.isArray(rows) || !rows.length) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '🏆 Поки що немає учасників. · No contributors yet.' });
    return true;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${esc(r.name || r.chat_id)} — ${r.points} pts`);
  await tg(env, 'sendMessage', { chat_id: chatId, text: `🏆 <b>Leaderboard</b>\n\n${lines.join('\n')}`, parse_mode: 'HTML' });
  return true;
}

// `/start bounty_{token}` — the deep-link entry point. Returns true if it
// consumed the update (whether or not the token was valid).
async function handleBountyStart(env, c, ctx) {
  if (!c.enabled) return false;
  const { userId, chatId, text } = ctx;
  const m = /^\/start\s+bounty_(\S+)/.exec(String(text || '').trim());
  if (!m) return false;
  const storeId = await verifyBountyToken(env, m[1]);
  if (!storeId) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Це посилання застаріле або недійсне. Спробуйте ще раз з карти. · This link expired or is invalid — try again from the map.' });
    return true;
  }
  const store = STORES.find((s) => s.id === storeId);
  if (!store) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Магазин не знайдено. · Store not found.' });
    return true;
  }
  await putBountySession(env, userId, { storeId, storeName: store.name, step: 'cycle' });
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: `📦 <b>${esc(store.name)}</b>\n\nПеріодичність завезення? · Restock cycle?`,
    parse_mode: 'HTML',
    reply_markup: getCycleLengthKeyboard(),
  });
  return true;
}

// Plain-text follow-up after "✏️ Інший" on a time step. Returns true if it
// consumed the update.
async function handleBountyText(env, c, ctx) {
  if (!c.enabled) return false;
  const { userId, chatId, text } = ctx;
  const session = await getBountySession(env, userId);
  if (!session || (session.step !== 'open_custom' && session.step !== 'close_custom') || !text) return false;
  const m = TIME_RE.exec(text.trim());
  if (!m) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Невірний формат. Введіть час як ГГ:ХХ (напр. 09:15) · Invalid format — enter as HH:MM (e.g. 09:15):' });
    return true;
  }
  const time = `${m[1].padStart(2, '0')}:${m[2]}`;
  if (session.step === 'open_custom') {
    session.open = time; session.step = 'close';
    await putBountySession(env, userId, session);
    await tg(env, 'sendMessage', { chat_id: chatId, text: `📦 <b>${esc(session.storeName)}</b>\n\nЧас закриття? · Closing time?`, parse_mode: 'HTML', reply_markup: getCloseTimeKeyboard() });
  } else {
    session.close = time; session.step = 'confirm';
    await putBountySession(env, userId, session);
    await tg(env, 'sendMessage', { chat_id: chatId, text: summaryText(session), parse_mode: 'HTML', reply_markup: getConfirmKeyboard() });
  }
  return true;
}

// Every callback_query (inline-keyboard tap) for the bounty flow.
async function handleAgentCallback(env, c, cq) {
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  if (!c.enabled) return;
  const uid = cq.from.id;
  const chatId = cq.message.chat.id;
  const message_id = cq.message.message_id;
  const data = String(cq.data || '');
  const edit = (text, keyboard) => tg(env, 'editMessageText', { chat_id: chatId, message_id, text, parse_mode: 'HTML', reply_markup: keyboard });

  if (data === 'confirm' || data === 'cancel') {
    const session = await getBountySession(env, uid);
    await clearBountySession(env, uid);
    if (!session) { await edit('Сесія застаріла.'); return; }
    if (data === 'cancel') { await edit('Скасовано. · Cancelled.'); return; }
    const updates = sessionToUpdates(session);
    try {
      await dispatchMapPatch(env, session.storeId, updates);
      await edit('✅ Дякуємо! Зміни надіслано на перевірку — зʼявляться на карті за кілька хвилин. · Thanks — changes are on their way to the map.');
    } catch (e) {
      await edit('⚠️ Не вдалося надіслати зміни. Спробуйте пізніше. · Could not send the changes — try again later.');
    }
    return;
  }

  // Owner tapped ✅/❌ on a visit push — the one-tap path from a field survey
  // onto the live map, using the same dispatch the bounty flow uses.
  if (data === 'vskip') {
    await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id, reply_markup: { inline_keyboard: [] } });
    await tg(env, 'sendMessage', { chat_id: chatId, text: '❌ Пропущено — на карту нічого не пішло. · Skipped, nothing published.' });
    return;
  }
  if (data.startsWith('vpub:')) {
    if (!c.ownerId || String(uid) !== c.ownerId) return;   // owner-only
    const key = 'visit:' + data.slice(5);
    let rec = null;
    try { rec = await env.VISITS.get(key, { type: 'json' }); } catch (e) {}
    if (!rec || !rec.store || !rec.store.id) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Запис візиту не знайдено. · Visit record not found.' });
      return;
    }
    const updates = visitToUpdates(rec);
    if (!Object.keys(updates).length) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'ℹ️ У цьому візиті немає даних для карти. · Nothing in this visit maps to a store field.' });
      return;
    }
    try {
      await dispatchMapPatch(env, rec.store.id, updates);
      await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id, reply_markup: { inline_keyboard: [] } });
      await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
        text: `✅ Надіслано на карту · Published to the map — <b>${esc(rec.store.name)}</b>\n<code>${esc(JSON.stringify(updates))}</code>` });
    } catch (e) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Не вдалося надіслати — перевірте GH_PAT і лог update-map. · Dispatch failed — check GH_PAT and the map-update workflow logs.' });
    }
    return;
  }

  const i = data.indexOf(':');
  const kind = i === -1 ? data : data.slice(0, i);
  const val = i === -1 ? '' : data.slice(i + 1);

  // Moderator tapping ✅/❌ on an edit-suggestion message (Feature 6). Gated
  // on isOwner/isAgent — defense in depth in case the moderator channel is
  // ever forwarded or shared beyond its intended audience. No parse_mode on
  // the edit below: the original message embeds contributor-supplied text
  // (see sendModeratorMessage in worker/worker.js, sent the same way for the
  // same reason), so re-sending it through an HTML-mode edit would let that
  // text be interpreted as markup instead of shown as plain text.
  const editPlain = (text) => tg(env, 'editMessageText', { chat_id: chatId, message_id, text });
  if (kind === 'editapprove' || kind === 'editreject') {
    const isOwner = c.ownerId && String(uid) === c.ownerId;
    const isAgent = c.agentIds.includes(String(uid));
    const original = cq.message.text || '';
    if (!isOwner && !isAgent) { await editPlain(original + '\n\n⛔ Not authorized.'); return; }
    if (!env.ADMIN_KEY) { await editPlain(original + '\n\n⚠️ ADMIN_KEY not set on the metrics Worker.'); return; }
    const action = kind === 'editapprove' ? 'approve' : 'reject';
    try {
      const res = await fetch(`${METRICS_WORKER_URL}/api/edit/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: val, action, key: env.ADMIN_KEY }),
      });
      const out = await res.json().catch(() => ({}));
      if (out.ok) {
        await editPlain(original + (action === 'approve' ? '\n\n✅ Approved — dispatched to the map.' : '\n\n❌ Rejected.'));
      } else {
        await editPlain(original + `\n\n⚠️ ${out.reason || 'Failed'}.`);
      }
    } catch (e) {
      await editPlain(original + '\n\n⚠️ Could not reach the metrics Worker.');
    }
    return;
  }

  const session = await getBountySession(env, uid);
  if (!session) { await edit('Сесія застаріла. Спробуйте ще раз з карти. · Session expired — try again from the map.'); return; }
  const title = `📦 <b>${esc(session.storeName)}</b>\n\n`;

  if (kind === 'cyc') {
    session.cycle = val;
    if (val === '7' || val === '14' || val === '35') {
      session.step = 'day';
      await putBountySession(env, uid, session);
      await edit(title + 'День завезення? · Restock day?', getDayOfWeekKeyboard());
    } else {
      session.step = 'open';
      await putBountySession(env, uid, session);
      await edit(title + 'Час відкриття? · Opening time?', getOpenTimeKeyboard());
    }
    return;
  }
  if (kind === 'day') {
    session.restockDay = val;
    session.step = 'open';
    await putBountySession(env, uid, session);
    await edit(title + 'Час відкриття? · Opening time?', getOpenTimeKeyboard());
    return;
  }
  if (kind === 'open') {
    if (val === 'custom') {
      session.step = 'open_custom';
      await putBountySession(env, uid, session);
      await edit('Введіть час відкриття (напр. 09:15): · Enter the opening time (e.g. 09:15):');
      return;
    }
    session.open = val;
    session.step = 'close';
    await putBountySession(env, uid, session);
    await edit(title + 'Час закриття? · Closing time?', getCloseTimeKeyboard());
    return;
  }
  if (kind === 'close') {
    if (val === 'custom') {
      session.step = 'close_custom';
      await putBountySession(env, uid, session);
      await edit('Введіть час закриття (напр. 19:45): · Enter the closing time (e.g. 19:45):');
      return;
    }
    session.close = val;
    session.step = 'confirm';
    await putBountySession(env, uid, session);
    await edit(summaryText(session), getConfirmKeyboard());
    return;
  }
}

// Telegram command menus. Everyone gets PUBLIC_CMDS; the owner & agents get an
// extended per-chat menu that also lists /visit — so only they see it in the menu
// (it's already functionally gated regardless). Bump CMD_VER to force a re-sync
// after editing the lists. Self-managing → no BotFather /setcommands needed.
const CMD_VER = 'v4';
const PUBLIC_CMDS = [
  { command: 'today', description: 'Магазини із завезенням сьогодні' },
  { command: 'cheap', description: 'Найкращі ціни на вагу зараз' },
  { command: 'submit', description: 'Додати свій магазин (власникам)' },
  { command: 'materials', description: 'Матеріали для друку: флаєри, наліпки' },
  { command: 'help', description: 'Команди та інформація' },
];
async function syncBotCommands(env, userId, isOwner, isAgent) {
  // Public default menu — set once globally.
  if ((await env.VISITS.get('cmds:default')) !== CMD_VER) {
    await tg(env, 'setMyCommands', { commands: PUBLIC_CMDS });
    await env.VISITS.put('cmds:default', CMD_VER);
  }
  // Extended menu — only for owner/agents, scoped to their own chat, once each.
  if (!(isOwner || isAgent)) return;
  if ((await env.VISITS.get('cmds:' + userId)) === CMD_VER) return;
  const cmds = PUBLIC_CMDS.concat([
    { command: 'route', description: '🧭 Маршрут по найближчих магазинах' },
    { command: 'visit', description: '📝 Записати візит у магазин' },
    { command: 'myvisits', description: 'Мої візити' },
    { command: 'pay', description: '💰 Схема оплати' },
    { command: 'job', description: '📋 Опис вакансії' },
    { command: 'cancel', description: 'Скасувати поточний візит' },
  ]);
  if (isOwner) cmds.push(
    { command: 'report', description: 'Звіт і оплата' },
    { command: 'export', description: 'Експорт візитів (CSV)' },
  );
  await tg(env, 'setMyCommands', { commands: cmds, scope: { type: 'chat', chat_id: userId } });
  await env.VISITS.put('cmds:' + userId, CMD_VER);
}

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function searchStores(query) {
  const q = norm(query);
  if (!q) return [];
  const byId = STORES.find((s) => s.id.toLowerCase() === q);
  if (byId) return [byId];
  return STORES.filter((s) => norm(s.name).includes(q) || (s.address && norm(s.address).includes(q))).slice(0, MATCH_LIMIT + 1);
}

// Metres between two {lat,lng} points (haversine).
function distM(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

// Nearest `n` stores to a point, closest first. The agent is standing at the
// shop, so proximity identifies it far more reliably than typing a Cyrillic
// name into a phone — and half the map is called some variant of "Second hand".
function nearestStores(from, n) {
  return STORES
    .filter((s) => !s.watermark && typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({ s, d: distM(from, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

// Greedy nearest-neighbour walking order — deliberately the same algorithm as
// the app's Day-0 route (nearestNeighborOrder in index.html), so a route from
// the bot and a route on the map agree. Not a shortest-path solver; with a
// dozen stops greedy is close enough and instant.
function walkOrder(stores, from) {
  const remaining = stores.slice();
  const order = [];
  let cur = from;
  while (remaining.length) {
    let idx = 0, best = Infinity;
    remaining.forEach((s, i) => { const d = distM(cur, s); if (d < best) { best = d; idx = i; } });
    const [next] = remaining.splice(idx, 1);
    order.push(next);
    cur = next;
  }
  return order;
}

const fmtDist = (m) => (m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1)} км`);

// "9.00-19.00" -> "09:00–19:00". The app only recognises colon-separated HH:MM
// (isOpenNow), so hours captured with a period would silently make the store
// read as closed all day. Mirrors normalizeHourStr() in index.html.
function normalizeHours(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^зач|^close/i.test(s)) return 'closed';
  return s
    .replace(/\s*[-–—]\s*/, '–')
    .replace(/(\d{1,2})\.(\d{2})/g, (m, h, mm) => h.padStart(2, '0') + ':' + mm)
    .slice(0, 40);
}

const isoDay = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (offsetDays || 0));
  return d.toISOString().slice(0, 10);
};
// Free-typed "13.08" / "13.08.2026" / "2026-08-13" -> ISO, else null.
function readDate(t) {
  const s = String(t || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{4}))?$/.exec(s);
  if (!m) return null;
  const y = m[3] || String(new Date().getUTCFullYear());
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
// Button text -> a delivery date. Precise for the two answers that cover most
// visits; anything vaguer is better recorded as unknown than guessed.
function readLastDelivery(t) {
  const n = norm(t);
  if (n.includes('сьогод') || n.includes('today')) return isoDay(0);
  if (n.includes('вчора') || n.includes('yesterday')) return isoDay(-1);
  if (n.includes('не знаю') || n.includes('unknown') || n === '-') return null;
  return readDate(t);
}

// Last time any agent logged this store, so a re-walked street doesn't get
// surveyed (and paid) twice by accident. One tiny key per store beats scanning
// every visit:* record.
const lastVisitKey = (storeId) => `lastvisit:${storeId}`;
const ROUTE_TTL = 60 * 60 * 12;
const routeKey = (uid) => `route:${uid}`;

const sessionKey = (uid) => `session:${uid}`;
const getSession = (env, uid) => env.VISITS.get(sessionKey(uid), { type: 'json' });
const putSession = (env, uid, s) => env.VISITS.put(sessionKey(uid), JSON.stringify(s), { expirationTtl: SESSION_TTL });
const clearSession = (env, uid) => env.VISITS.delete(sessionKey(uid));

// Interpret bilingual button text into stored values.
function readPricing(t) {
  const n = norm(t);
  if (n.includes('вага') || n.includes('weight')) return 'kg';
  if (n.includes('штук') || n.includes('itemi')) return 'item';
  if (n.includes('обид') || n.includes('both')) return 'both';
  return 'unknown';
}
function readSize(t) {
  const n = norm(t);
  if (n.includes('s ') || n.includes('мал') || n.includes('small')) return 'S';
  if (n.includes('l ') || n.includes('вел') || n.includes('large')) return 'L';
  return 'M';
}
const readYes = (t) => /так|yes|✅/i.test(String(t));

const ROUTE_SIZE = 12;        // a day's zone, matching the handbook's 10–15
const DUP_WINDOW_DAYS = 30;   // re-surveying inside this warns before submit

async function startVisit(env, uid, chatId) {
  await putSession(env, uid, { step: 'location', qi: 0, data: {} });
  await say(env, chatId,
    '📝 <b>Новий візит · New visit</b>\n' +
    '1️⃣ Надішліть <b>геолокацію</b> (📎 → Location → Send current location) — покажу найближчі магазини.\n' +
    'Share your <b>location</b> and I\u2019ll list the stores around you.\n\n' +
    '/cancel щоб вийти · to abort');
}

// Offer the stores closest to where the agent is standing, numbered, with a
// route marker so someone following /route knows which stop is which.
async function promptStorePick(env, uid, chatId, session) {
  const from = { lat: session.data.lat, lng: session.data.lng };
  const near = nearestStores(from, 8);
  let routeIds = [];
  try {
    const r = await env.VISITS.get(routeKey(uid), { type: 'json' });
    if (r && Array.isArray(r.ids)) routeIds = r.ids;
  } catch (e) {}
  session.data.nearby = near.map(({ s }) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng }));
  session.step = 'store';
  await putSession(env, uid, session);
  const lines = near.map(({ s, d }, i) => {
    const onRoute = routeIds.includes(s.id) ? ` 🧭${routeIds.indexOf(s.id) + 1}` : '';
    return `${i + 1}. <b>${esc(s.name)}</b>${onRoute} · ${fmtDist(d)}${s.address ? ' — ' + esc(s.address) : ''}`;
  });
  // The line on a real map, from wherever they are in the round — no need to
  // re-run /route to get their bearings.
  const mapIds = (routeIds.length ? routeIds : near.map(({ s }) => s.id)).join(',');
  await say(env, chatId,
    '2️⃣ Який це магазин? Надішліть номер · Which store? Reply with the number:\n' + lines.join('\n') +
    `\n\n🗺️ <a href="${APP_URL}?route=${mapIds}">${routeIds.length ? 'Маршрут на карті · Route on the map' : 'Ці магазини на карті · These stores on the map'}</a>` +
    '\n\nНемає у списку — надішліть назву, або <code>new Назва</code>.\nNot listed — send a name, or <code>new Name</code>.',
    near.map((_, i) => [String(i + 1)]));
}

// Common tail for every way of choosing a store: distance sanity-check against
// the map pin, duplicate-survey warning, then on to the photo.
async function pickStore(env, uid, chatId, session, store) {
  session.data.store = store;
  session.data.distM = (store.lat != null && session.data.lat != null)
    ? distM({ lat: store.lat, lng: store.lng }, { lat: session.data.lat, lng: session.data.lng })
    : null;
  session.data.dupDays = null;
  if (store.id) {
    try {
      const last = await env.VISITS.get(lastVisitKey(store.id));
      if (last) {
        const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
        if (days >= 0 && days < DUP_WINDOW_DAYS) session.data.dupDays = days;
      }
    } catch (e) {}
  }
  session.step = 'photo';
  await putSession(env, uid, session);
  const warn = session.data.distM != null && session.data.distM > NEAR_METERS
    ? `\n⚠️ ~${session.data.distM} м від точки на карті — переконайтесь, що ви біля магазину. · ~${session.data.distM} m from the map pin.`
    : '';
  const dup = session.data.dupDays != null
    ? `\n⚠️ Цей магазин уже обстежували <b>${session.data.dupDays} дн. тому</b> — база за візит нараховується раз на цикл. · Already surveyed ${session.data.dupDays} day(s) ago.`
    : '';
  await say(env, chatId, `✅ ${esc(store.name)}${store.isNew ? ' <i>(новий · new)</i>' : ''}${warn}${dup}\n\n📷 Надішліть <b>одне фото</b> вітрини/входу. · Send <b>one photo</b> of the storefront.`);
}

// Advance to the next questionnaire step.
async function askNext(env, uid, chatId, session) {
  let i = session.qi;
  while (i < QUESTIONS.length) {
    const question = QUESTIONS[i];
    session.qi = i;
    session.step = 'question';
    await putSession(env, uid, session);
    return say(env, chatId, question.q, question.kb);
  }
  // Questions done → confirmation.
  session.step = 'confirm';
  await putSession(env, uid, session);
  return say(env, chatId, summary(session) + '\n\n<b>Надіслати? · Submit?</b>', [['✅ Надіслати / Submit', '✖️ Скасувати / Cancel']]);
}

function summary(session) {
  const d = session.data;
  const st = d.store;
  const lines = [
    '🧾 <b>Перевірте візит · Review visit</b>',
    `🏪 ${esc(st.name)}${st.isNew ? ' <i>(новий · new)</i>' : ''}`,
  ];
  if (st.address) lines.push(`📍 ${esc(st.address)}`);
  if (d.lat != null) lines.push(`🗺️ GPS ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.distM != null ? ` (~${d.distM} м від точки/from pin)` : ''}`);
  lines.push(`📷 Фото · Photo: ${d.photoFileId ? '✅' : '—'}`);
  lines.push(`💰 Ціни · Pricing: ${esc(d.pricing || '—')}`);
  if (d.lastDelivery) lines.push(`📦 Останній завіз · Last delivery: ${esc(d.lastDelivery)}`);
  if (d.dupDays != null) lines.push(`⚠️ <b>Цей магазин уже обстежували ${d.dupDays} дн. тому.</b> · Already surveyed ${d.dupDays} day(s) ago.`);
  lines.push(`🕐 Години · Hours: ${esc(d.hours || '—')}`);
  lines.push(`📐 Розмір · Size: ${esc(d.size || '—')}`);
  lines.push(`🪧 Плакат · Poster: ${d.poster ? '✅' : '❌'}`);
  lines.push(`🤝 Контакт · Contact: ${d.contact ? '✅' : '❌'}`);
  if (d.notes && d.notes !== '-') lines.push(`📝 ${esc(d.notes)}`);
  return lines.join('\n');
}

async function bump(env, key, by = 1) {
  const cur = Number((await env.VISITS.get('count:' + key)) || 0) + by;
  await env.VISITS.put('count:' + key, String(cur));
  return cur;
}

// The survey answers that correspond to real stores.json fields. Anything the
// agent left unknown is omitted rather than written as a guess.
function visitToUpdates(rec) {
  const u = {};
  if (rec.hours) {
    const h = normalizeHours(rec.hours);
    if (h) { u.hours = {}; for (const d of ['mon','tue','wed','thu','fri','sat','sun']) u.hours[d] = h; }
  }
  if (rec.pricing === 'kg' || rec.pricing === 'item') u.pricing = rec.pricing;
  if (rec.lastDelivery) u.restock_date = rec.lastDelivery;
  return u;
}

async function finishVisit(env, c, uid, chatId, session, from) {
  const d = session.data;
  const now = new Date();
  const rec = {
    ts: now.toISOString(),
    agentId: uid,
    agentName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(uid),
    store: d.store,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    distM: d.distM ?? null,
    photoFileId: d.photoFileId || null,
    pricing: d.pricing || null,
    lastDelivery: d.lastDelivery || null,
    hours: d.hours || null,
    size: d.size || null,
    poster: !!d.poster,
    contact: !!d.contact,
    notes: d.notes && d.notes !== '-' ? d.notes : null,
  };
  // Key sorts chronologically; include uid so two agents can't collide on a ts.
  await env.VISITS.put(`visit:${rec.ts}:${uid}`, JSON.stringify(rec));
  // Stamp the store so a re-walk inside DUP_WINDOW_DAYS warns next time, and
  // tick it off the agent's route if they're following one.
  if (rec.store && rec.store.id) {
    await env.VISITS.put(lastVisitKey(rec.store.id), rec.ts);
    try {
      const r = await env.VISITS.get(routeKey(uid), { type: 'json' });
      if (r && Array.isArray(r.ids) && r.ids.includes(rec.store.id) && !r.done.includes(rec.store.id)) {
        r.done.push(rec.store.id);
        await env.VISITS.put(routeKey(uid), JSON.stringify(r), { expirationTtl: ROUTE_TTL });
      }
    } catch (e) {}
  }
  const bonusUnits = (rec.poster ? 1 : 0) + (rec.contact ? 1 : 0);
  await bump(env, 'total');
  await bump(env, 'agent:' + uid);
  if (bonusUnits) await bump(env, 'bonus', bonusUnits);
  await clearSession(env, uid);

  const earned = c.rateVisit + bonusUnits * c.rateBonus;
  const mine = Number((await env.VISITS.get('count:agent:' + uid)) || 0);
  await say(env, chatId,
    `✅ <b>Візит записано! · Visit logged!</b>\n` +
    `💵 +₴${c.rateVisit}${bonusUnits ? ` +₴${bonusUnits * c.rateBonus} бонус/bonus` : ''} = <b>₴${earned}</b>\n` +
    `📊 Ваших візитів усього · Your total visits: <b>${mine}</b>\n\n` +
    `Наступний магазин — /visit · Next store — /visit`);

  // Real-time push to the owner (photo + summary) for verification, if configured.
  if (c.ownerId) {
    const caption = summary(session).replace('🧾 <b>Перевірте візит · Review visit</b>', `🆕 <b>Візит · Visit</b> — ${esc(rec.agentName)}`);
    // A survey collects exactly the fields stores.json holds, so offer to put
    // them on the map right here rather than leaving the owner to retype a CSV.
    // Only for stores that already exist — a brand-new one has no id to patch.
    const patch = visitToUpdates(rec);
    const kb = (rec.store && rec.store.id && Object.keys(patch).length)
      ? { inline_keyboard: [[
          { text: '✅ Опублікувати · Publish', callback_data: `vpub:${rec.ts}:${uid}` },
          { text: '❌ Пропустити · Skip', callback_data: 'vskip' },
        ]] }
      : undefined;
    if (rec.photoFileId) await tg(env, 'sendPhoto', { chat_id: c.ownerId, photo: rec.photoFileId, caption, parse_mode: 'HTML', reply_markup: kb });
    else await tg(env, 'sendMessage', { chat_id: c.ownerId, text: caption, parse_mode: 'HTML', reply_markup: kb });
  }
}

async function ownerReport(env, c, chatId) {
  const total = Number((await env.VISITS.get('count:total')) || 0);
  const bonus = Number((await env.VISITS.get('count:bonus')) || 0);
  const lines = ['📊 <b>Field report · Звіт</b>', `Visits logged: <b>${total}</b>`, `Bonus events: <b>${bonus}</b>`];
  // Per-agent counts.
  for (const id of c.agentIds) {
    const n = Number((await env.VISITS.get('count:agent:' + id)) || 0);
    if (n) lines.push(`• agent <code>${id}</code>: ${n} visits`);
  }
  const pay = total * c.rateVisit + bonus * c.rateBonus;
  lines.push('', `💵 Estimated pay: <b>₴${pay}</b>  (₴${c.rateVisit}/visit + ₴${c.rateBonus}/bonus)`);
  lines.push('Use /export for the full CSV.');
  await say(env, chatId, lines.join('\n'));
}

async function ownerExport(env, chatId) {
  const list = await env.VISITS.list({ prefix: 'visit:', limit: 1000 });
  const rows = [['ts', 'agentId', 'agentName', 'storeId', 'storeName', 'lat', 'lng', 'distM', 'pricing', 'lastDelivery', 'hours', 'size', 'poster', 'contact', 'notes', 'photoFileId']];
  for (const k of list.keys) {
    const r = await env.VISITS.get(k.name, { type: 'json' });
    if (!r) continue;
    const csv = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    rows.push([r.ts, r.agentId, r.agentName, r.store?.id || '', r.store?.name || '', r.lat, r.lng, r.distM, r.pricing, r.lastDelivery, r.hours, r.size, r.poster, r.contact, r.notes, r.photoFileId].map(csv));
  }
  const csvText = rows.map((row) => row.join(',')).join('\n');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', `📄 ${rows.length - 1} visit(s)`);
  form.append('document', new Blob([csvText], { type: 'text/csv' }), `visits-${new Date().toISOString().slice(0, 10)}.csv`);
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
}

function notAgentMsg(uid) {
  return `🔒 Ви не в списку польових агентів. · You're not a registered field agent.\n` +
    `Надішліть власнику цей ID, щоб отримати доступ · Send this ID to the owner to get access:\n<code>${uid}</code>`;
}

// Job brief for a prospective/onboarding agent to read and review.
const JOB_BRIEF_URL = 'https://claude.ai/code/artifact/8707b32b-6c47-4df0-9176-7ddccfbe7264';
function jobText() {
  return [
    '📋 <b>Опис вакансії · Job brief</b>',
    'Повний опис ролі, як це працює та схема оплати (UA/EN):',
    'Full role, workflow and pay scheme:',
    '',
    `👉 <a href="${JOB_BRIEF_URL}">Відкрити опис вакансії · Open the job brief</a>`,
    '',
    'Питання? Пишіть власнику у capybara-bot. · Questions? Message the owner in capybara-bot.',
  ].join('\n');
}

// Agent-facing pay scheme, rendered live from the configured rates so it always
// matches /report. Keep in sync with docs/FIELD_AGENT.md §2.
function payText(c) {
  return [
    '💰 <b>Схема оплати · Payment scheme</b>',
    '',
    `📍 <b>База за візит · Visit base: ₴${c.rateVisit}</b>`,
    'За кожен перевірений візит: GPS + фото вітрини + повна анкета у /visit.',
    'Per verified visit: GPS + storefront photo + full questionnaire in /visit.',
    'Один магазин = одна база за цикл. · One store = one base per survey cycle.',
    '',
    `🎁 <b>Бонус · Bonus: ₴${c.rateBonus}</b> (кожен · each)`,
    '• QR-плакат розміщено (фото-доказ) · QR poster placed (photo proof)',
    '• Власник зареєструвався (контакт + згода) · Owner signed up (contact + consent)',
    'Обидва можуть діяти разом → два бонуси. · Both can apply → two bonuses.',
    '',
    '🎯 Ціль · Target: 8–12 магазинів/день · stores/day.',
    '🗓️ Виплати щотижня — власник звіряє /report і фото. · Weekly pay; owner reconciles /report + photos.',
    '',
    '📈 <b>Фаза 2 (згодом) · Phase 2 (later)</b> — коли ви продаєте промо:',
    'разова премія за підписаний магазин · one-time bonus per signed store',
    '(₴300–₴500 Featured, ₴800 Spotlight). Ще не активно. · Not active yet.',
  ].join('\n');
}

// Handle an update for the visit subsystem. Returns true if it consumed the update.
async function handleVisit(env, c, msg, ctx) {
  const { userId, chatId, text, from } = ctx;
  const isOwner = c.ownerId && String(userId) === c.ownerId;
  const isAgent = c.agentIds.includes(String(userId));
  const command = text ? (/^\/([a-z]+)(?:@\w+)?/i.exec(text.trim()) || [])[1]?.toLowerCase() : null;

  // Keep each person's Telegram command menu in sync (public menu for everyone;
  // the extended /visit menu only for the owner & agents).
  if (command) await syncBotCommands(env, userId, isOwner, isAgent);

  if (isOwner && (command === 'report' || command === 'visits')) { await ownerReport(env, c, chatId); return true; }
  if (isOwner && command === 'export') { await ownerExport(env, chatId); return true; }

  const session = await getSession(env, userId);

  if (command === 'cancel') {
    if (session) { await clearSession(env, userId); await say(env, chatId, 'Скасовано. · Cancelled. /visit щоб почати знову.'); return true; }
    return false;
  }
  if (command === 'myvisits') {
    if (!isAgent) return false;
    const n = Number((await env.VISITS.get('count:agent:' + userId)) || 0);
    await say(env, chatId, `📊 Ваших візитів усього · Your total visits: <b>${n}</b>`);
    return true;
  }
  if (command === 'pay') {
    if (!(isAgent || isOwner)) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await say(env, chatId, payText(c));
    return true;
  }
  if (command === 'job' || command === 'brief') {
    if (!(isAgent || isOwner)) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await say(env, chatId, jobText());
    return true;
  }
  if (command === 'route') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await putSession(env, userId, { step: 'route_loc', qi: 0, data: {} });
    await say(env, chatId,
      '🧭 <b>Маршрут на сьогодні · Today\u2019s route</b>\n' +
      'Надішліть свою <b>геолокацію</b> — складу маршрут по найближчих магазинах.\n' +
      'Share your <b>location</b> and I\u2019ll plan a walking route through the nearest stores.\n\n' +
      '/cancel щоб вийти · to abort');
    return true;
  }

  if (command === 'visit') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    // Don't silently discard a half-finished survey — losing a photo and six
    // answers to a mistyped command is the worst thing this flow can do.
    if (session && session.step !== 'route_loc' && session.step !== 'done') {
      session.step = 'resume_ask';
      await putSession(env, userId, session);
      await say(env, chatId,
        '⚠️ У вас є незавершений візит' + (session.data.store ? ` — <b>${esc(session.data.store.name)}</b>` : '') + '.\n' +
        'You have a survey in progress. Continue it, or start over?',
        [['▶️ Продовжити / Continue', '🔄 Почати заново / Restart']]);
      return true;
    }
    await startVisit(env, userId, chatId);
    return true;
  }

  // No active session and not one of our commands → let the public handler reply.
  if (!session) return false;

  // A public/other slash-command mid-session escapes to the normal handlers, so
  // /help, /materials, etc. keep working; the session stays and can be resumed.
  if (command) return false;

  // ── In-session step machine ──
  if (session.step === 'resume_ask') {
    if (/продовж|continue|▶/i.test(text || '')) {
      // Put them back on the step they were answering.
      session.step = session.data.photoFileId ? 'question' : (session.data.store ? 'photo' : 'store');
      await putSession(env, userId, session);
      if (session.step === 'question') return askNext(env, userId, chatId, session);
      if (session.step === 'photo') { await say(env, chatId, '📷 Надішліть <b>одне фото</b> вітрини/входу. · Send <b>one photo</b> of the storefront.'); return true; }
      await promptStorePick(env, userId, chatId, session);
      return true;
    }
    await startVisit(env, userId, chatId);
    return true;
  }

  // /route — one location in, a walking order out.
  if (session.step === 'route_loc') {
    if (!msg.location) { await say(env, chatId, '📍 Потрібна геолокація: 📎 → Location. · Please share a location.'); return true; }
    const from = { lat: msg.location.latitude, lng: msg.location.longitude };
    const near = nearestStores(from, ROUTE_SIZE).map((x) => x.s);
    await clearSession(env, userId);
    if (!near.length) { await say(env, chatId, '🤷 Поблизу нічого не знайшов. · No stores found nearby.'); return true; }
    const ordered = walkOrder(near, from);
    let cur = from, total = 0;
    const lines = ordered.map((s, i) => {
      const leg = distM(cur, s); total += leg; cur = s;
      return `${i + 1}. <b>${esc(s.name)}</b>${s.address ? ' — ' + esc(s.address) : ''} · ${fmtDist(leg)}`;
    });
    await env.VISITS.put(routeKey(userId), JSON.stringify({ ids: ordered.map((s) => s.id), done: [], ts: Date.now() }), { expirationTtl: ROUTE_TTL });
    // Google Maps caps a walking URL at ~10 waypoints; keep the link inside that.
    const mapsUrl = 'https://www.google.com/maps/dir/?api=1&travelmode=walking'
      + `&origin=${from.lat},${from.lng}`
      + `&destination=${ordered[ordered.length - 1].lat},${ordered[ordered.length - 1].lng}`
      + (ordered.length > 1 ? '&waypoints=' + ordered.slice(0, -1).slice(0, 9).map((s) => `${s.lat},${s.lng}`).join('|') : '');
    const routeUrl = `${APP_URL}?route=${ordered.map((s) => s.id).join(',')}`;
    await say(env, chatId,
      `🧭 <b>Маршрут · Route</b> — ${ordered.length} магазинів, ~${fmtDist(total)} пішки\n\n` +
      lines.join('\n') +
      `\n\n🗺️ <a href="${routeUrl}">Показати на карті · See it on the map</a>` +
      `\n🧭 <a href="${mapsUrl}">Навігація в Google Maps · Turn-by-turn in Google Maps</a>\n\n` +
      'Далі — /visit біля першого магазину. · Then /visit at the first store.');
    return true;
  }

  // GPS first: the agent is standing at the shop, so proximity names it far
  // faster and more reliably than typing into a phone.
  if (session.step === 'location') {
    if (!msg.location) { await say(env, chatId, '📍 Потрібна геолокація: 📎 → Location → Send current location.\nPlease share a location.'); return true; }
    session.data.lat = msg.location.latitude;
    session.data.lng = msg.location.longitude;
    await promptStorePick(env, userId, chatId, session);
    return true;
  }

  if (session.step === 'store') {
    const raw = (text || '').trim();
    if (!raw) { await say(env, chatId, 'Оберіть номер зі списку, або надішліть назву. · Pick a number, or send a name.'); return true; }

    if (/^new\s+/i.test(raw)) {
      await pickStore(env, userId, chatId, session, { isNew: true, name: raw.replace(/^new\s+/i, '').trim() });
      return true;
    }
    // A bare number picks from the nearby list we just showed.
    const n = parseInt(raw, 10);
    if (!isNaN(n) && session.data.nearby && session.data.nearby[n - 1]) {
      await pickStore(env, userId, chatId, session, session.data.nearby[n - 1]);
      return true;
    }
    // Otherwise fall back to name search, for a store that isn't nearby.
    const hits = searchStores(raw);
    if (!hits.length) { await say(env, chatId, '🤷 Не знайдено. Оберіть номер, спробуйте іншу назву, або <code>new Назва</code>.\nNo match — pick a number, try another name, or <code>new Name</code>.'); return true; }
    if (hits.length === 1) {
      const s = hits[0];
      await pickStore(env, userId, chatId, session, { id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng });
      return true;
    }
    session.step = 'store_pick';
    session.data.candidates = hits.slice(0, MATCH_LIMIT).map((s) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng }));
    await putSession(env, userId, session);
    const list = session.data.candidates.map((s, i) => `${i + 1}. ${esc(s.name)}${s.address ? ' — ' + esc(s.address) : ''}`).join('\n');
    await say(env, chatId, 'Кілька збігів — надішліть номер · Several matches — reply with the number:\n' + list,
      session.data.candidates.map((_, i) => [String(i + 1)]));
    return true;
  }

  if (session.step === 'store_pick') {
    const n = parseInt((text || '').trim(), 10);
    const pick = session.data.candidates && session.data.candidates[n - 1];
    if (!pick) { await say(env, chatId, 'Надішліть номер зі списку. · Reply with a number from the list.'); return true; }
    delete session.data.candidates;
    await pickStore(env, userId, chatId, session, pick);
    return true;
  }

  if (session.step === 'photo') {
    if (!msg.photo || !msg.photo.length) { await say(env, chatId, '📷 Потрібне фото. · A photo is required. Send one photo.'); return true; }
    session.data.photoFileId = msg.photo[msg.photo.length - 1].file_id; // largest size
    session.qi = 0;
    await putSession(env, userId, session);
    return handleQuestionsStart(env, userId, chatId, session);
  }

  if (session.step === 'question') {
    const question = QUESTIONS[session.qi];
    const val = (text || '').trim();
    if (!val && question.key !== 'notes') { await say(env, chatId, 'Оберіть варіант або надішліть відповідь. · Pick an option or send an answer.'); return true; }
    switch (question.key) {
      case 'pricing': session.data.pricing = readPricing(val); break;
      case 'lastdel': session.data.lastDelivery = readLastDelivery(val); break;
      case 'hours': session.data.hours = normalizeHours(val); break;
      case 'size': session.data.size = readSize(val); break;
      case 'poster': session.data.poster = readYes(val); break;
      case 'contact': session.data.contact = readYes(val); break;
      case 'notes': session.data.notes = val || '-'; break;
    }
    session.qi++;
    await putSession(env, userId, session);
    return askNext(env, userId, chatId, session);
  }

  if (session.step === 'confirm') {
    if (readYes(text) || /надіслати|submit/i.test(text || '')) {
      await finishVisit(env, c, userId, chatId, session, from);
      return true;
    }
    if (/скасувати|cancel|✖️|❌/i.test(text || '')) {
      await clearSession(env, userId);
      await say(env, chatId, 'Скасовано. · Cancelled.');
      return true;
    }
    await say(env, chatId, 'Оберіть: ✅ Надіслати або ✖️ Скасувати. · Choose Submit or Cancel.', [['✅ Надіслати / Submit', '✖️ Скасувати / Cancel']]);
    return true;
  }

  return false;
}

// First questionnaire prompt after the photo.
async function handleQuestionsStart(env, uid, chatId, session) {
  session.step = 'question';
  session.qi = 0;
  await putSession(env, uid, session);
  const question = QUESTIONS[0];
  return say(env, chatId, question.q, question.kb);
}

export default {
  async fetch(request, env) {
    // Health check.
    if (request.method === 'GET') {
      return ok('Lviv Second Hand Telegram bot is running.');
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Authenticate: Telegram echoes the secret we set with setWebhook.
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return ok(); // Malformed body — ack so Telegram doesn't retry forever.
    }

    const c = cfg(env);

    // Inline-keyboard taps (bounty flow) arrive as callback_query, not message.
    if (update.callback_query) {
      try { await handleAgentCallback(env, c, update.callback_query); } catch (e) {}
      return ok();
    }

    const msg = update.message || update.edited_message;
    if (!msg) return ok(); // Ignore joins/etc.
    const from = msg.from || {};
    const chatId = msg.chat.id;
    const text = typeof msg.text === 'string' ? msg.text : null;
    const ctx = { userId: from.id, chatId, text, from };

    // Flash-deal subscribe/unsubscribe (Feature 5). Only needs BOT_TOKEN.
    try {
      if (await handleFlashSubStart(env, ctx)) return ok();
      if (await handleStopCommand(env, ctx)) return ok();
    } catch (e) {}

    // Crowdsourced moderation (Feature 6). Only needs BOT_TOKEN.
    try {
      if (await handleEditStart(env, ctx)) return ok();
      if (await handleLeaderboardCommand(env, ctx)) return ok();
    } catch (e) {}

    // Field-agent subsystems (stateful). Only when BOT_TOKEN + VISITS are set.
    if (c.enabled) {
      try {
        if (await handleBountyStart(env, c, ctx)) return ok();
        if (await handleBountyText(env, c, ctx)) return ok();
        const consumed = await handleVisit(env, c, msg, ctx);
        if (consumed) return ok();
      } catch (e) {
        // Never let the field flow break the public bot; ack and move on.
        return ok();
      }
    }

    // Public, stateless commands (answered in the webhook response — no token).
    if (!text) return ok();
    return sendMessage(chatId, replyFor(text));
  },
};
