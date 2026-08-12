// ─────────────────────────────────────────────────────────────────────────────
// Lviv Second Hand — Telegram bot (Cloudflare Worker, webhook-based)
//
// Public commands (stateless, answered inside the webhook response — no token):
//   /start, /help — intro + command list
//   /today        — stores getting fresh stock TODAY (fixed weekly restock day)
//   /cheap        — best by-weight deals right now (late in the weekly cycle)
//   /submit       — point store owners at the web submission form
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
// index.html at build time into stores.gen.js (see build-data.mjs). Visit records
// live in the VISITS KV namespace, keyed so they sort chronologically.
// ─────────────────────────────────────────────────────────────────────────────
import { STORES } from './stores.gen.js';
import {
  getCycleLengthKeyboard, getDayOfWeekKeyboard, getOpenTimeKeyboard, getCloseTimeKeyboard,
  getConfirmKeyboard, summaryText, sessionToUpdates,
} from './telegram-agent-keyboards.js';

const APP_URL = 'https://www.lvivsecondhand.com/';
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
  { key: 'restock', q: '4️⃣ День завезення (для ваги)? · Restock day (by-weight)?', kb: [['Пн/Mon', 'Вт/Tue', 'Ср/Wed'], ['Чт/Thu', 'Пт/Fri', 'Сб/Sat'], ['Нд/Sun', '— Немає/None', '❓ Unknown']], onlyWeight: true },
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
// the token that Worker signed) and GITHUB_PAT (to dispatch the resulting
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
  if (!env.GITHUB_PAT) throw new Error('GITHUB_PAT not configured');
  const res = await fetch('https://api.github.com/repos/anonymouspartner/lviv-secondhand/dispatches', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lviv-secondhand-bot',
    },
    body: JSON.stringify({ event_type: 'update_map_data', client_payload: { store_id: storeId, updates } }),
  });
  if (res.status !== 204) throw new Error(`dispatch failed: ${res.status}`);
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

  const i = data.indexOf(':');
  const kind = i === -1 ? data : data.slice(0, i);
  const val = i === -1 ? '' : data.slice(i + 1);
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
const CMD_VER = 'v3';
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
function readDay(t) {
  const n = norm(t);
  for (const d of DAYS) if (n.startsWith(d) || n.includes('/' + d)) return d;
  if (n.includes('пн')) return 'mon'; if (n.includes('вт')) return 'tue'; if (n.includes('ср')) return 'wed';
  if (n.includes('чт')) return 'thu'; if (n.includes('пт')) return 'fri'; if (n.includes('сб')) return 'sat'; if (n.includes('нд')) return 'sun';
  if (n.includes('немає') || n.includes('none')) return '—';
  return 'unknown';
}
function readSize(t) {
  const n = norm(t);
  if (n.includes('s ') || n.includes('мал') || n.includes('small')) return 'S';
  if (n.includes('l ') || n.includes('вел') || n.includes('large')) return 'L';
  return 'M';
}
const readYes = (t) => /так|yes|✅/i.test(String(t));

// Advance to the next questionnaire step, skipping restock for non-weight stores.
async function askNext(env, uid, chatId, session) {
  let i = session.qi;
  while (i < QUESTIONS.length) {
    const question = QUESTIONS[i];
    if (question.onlyWeight && !['kg', 'both'].includes(session.data.pricing)) {
      session.data.restock = 'n/a';
      i++;
      continue;
    }
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
  if (d.restock && d.restock !== 'n/a') lines.push(`📦 Завезення · Restock: ${esc(d.restock)}`);
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
    restock: d.restock || null,
    hours: d.hours || null,
    size: d.size || null,
    poster: !!d.poster,
    contact: !!d.contact,
    notes: d.notes && d.notes !== '-' ? d.notes : null,
  };
  // Key sorts chronologically; include uid so two agents can't collide on a ts.
  await env.VISITS.put(`visit:${rec.ts}:${uid}`, JSON.stringify(rec));
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
    if (rec.photoFileId) await tg(env, 'sendPhoto', { chat_id: c.ownerId, photo: rec.photoFileId, caption, parse_mode: 'HTML' });
    else await tg(env, 'sendMessage', { chat_id: c.ownerId, text: caption, parse_mode: 'HTML' });
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
  const rows = [['ts', 'agentId', 'agentName', 'storeId', 'storeName', 'lat', 'lng', 'distM', 'pricing', 'restock', 'hours', 'size', 'poster', 'contact', 'notes', 'photoFileId']];
  for (const k of list.keys) {
    const r = await env.VISITS.get(k.name, { type: 'json' });
    if (!r) continue;
    const csv = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    rows.push([r.ts, r.agentId, r.agentName, r.store?.id || '', r.store?.name || '', r.lat, r.lng, r.distM, r.pricing, r.restock, r.hours, r.size, r.poster, r.contact, r.notes, r.photoFileId].map(csv));
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
  if (command === 'visit') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    const fresh = { step: 'store', qi: 0, data: {} };
    await putSession(env, userId, fresh);
    await say(env, chatId,
      '📝 <b>Новий візит · New visit</b>\n' +
      '1️⃣ Назва магазину (або частина)? Для нового магазину: <code>new Назва</code>.\n' +
      'Store name (or part)? For a store not on the map: <code>new Name</code>.\n\n' +
      '/cancel щоб вийти · to abort');
    return true;
  }

  // No active session and not one of our commands → let the public handler reply.
  if (!session) return false;

  // A public/other slash-command mid-session escapes to the normal handlers, so
  // /help, /materials, etc. keep working; the session stays and can be resumed.
  if (command) return false;

  // ── In-session step machine ──
  if (session.step === 'store') {
    const raw = (text || '').trim();
    if (!raw) { await say(env, chatId, 'Надішліть назву магазину текстом. · Send the store name as text.'); return true; }
    if (/^new\s+/i.test(raw)) {
      session.data.store = { isNew: true, name: raw.replace(/^new\s+/i, '').trim() };
      session.step = 'location';
      await putSession(env, userId, session);
      await say(env, chatId, '📍 Надішліть <b>геолокацію</b> магазину (📎 → Location → Send current location).\nShare the store <b>location</b>.');
      return true;
    }
    const hits = searchStores(raw);
    if (!hits.length) { await say(env, chatId, '🤷 Не знайдено. Спробуйте іншу назву, або <code>new Назва</code>.\nNo match — try again, or <code>new Name</code>.'); return true; }
    if (hits.length === 1) {
      const s = hits[0];
      session.data.store = { id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng };
      session.step = 'location';
      await putSession(env, userId, session);
      await say(env, chatId, `✅ ${esc(s.name)}\n📍 Тепер надішліть <b>геолокацію</b> магазину.\nNow share the store <b>location</b> (📎 → Location).`);
      return true;
    }
    // Ambiguous → numbered list.
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
    session.data.store = pick;
    delete session.data.candidates;
    session.step = 'location';
    await putSession(env, userId, session);
    await say(env, chatId, `✅ ${esc(pick.name)}\n📍 Надішліть <b>геолокацію</b> магазину. · Share the store <b>location</b>.`);
    return true;
  }

  if (session.step === 'location') {
    if (!msg.location) { await say(env, chatId, '📍 Потрібна геолокація: 📎 → Location → Send current location.\nPlease share a location.'); return true; }
    session.data.lat = msg.location.latitude;
    session.data.lng = msg.location.longitude;
    const st = session.data.store;
    if (st && st.lat != null) {
      session.data.distM = distM({ lat: st.lat, lng: st.lng }, { lat: session.data.lat, lng: session.data.lng });
    }
    session.step = 'photo';
    await putSession(env, userId, session);
    const warn = session.data.distM != null && session.data.distM > NEAR_METERS
      ? `\n⚠️ ~${session.data.distM} м від точки на карті. Переконайтесь, що ви біля магазину. · ~${session.data.distM} m from the map pin — make sure you're at the store.`
      : '';
    await say(env, chatId, '📷 Надішліть <b>одне фото</b> вітрини/входу. · Send <b>one photo</b> of the storefront.' + warn);
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
      case 'restock': session.data.restock = readDay(val); break;
      case 'hours': session.data.hours = val; break;
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
