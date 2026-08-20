// ─────────────────────────────────────────────────────────────────────────────
// Lviv Second Hand — Telegram bot (Cloudflare Worker, webhook-based)
//
// Public commands (stateless, answered inside the webhook response — no token):
//   /start, /help — intro + command list — also attaches the persistent
//                   reply-keyboard menu (see replyFor/MAIN_MENU_MARKUP), a
//                   one-tap alternative to typing any of the below
//   /today        — stores getting fresh stock TODAY (fixed weekly restock day)
//   /day <day>    — same, for any weekday (en/uk name or short uk form)
//   /rare         — stores on a longer-than-weekly restock cycle (14, 35 days…)
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
// General feedback (active, needs BOT_TOKEN + VISITS — see handleFeedbackFlow):
//   /feedback [text] — general feedback about the app or bot, not tied to a
//                      store; POSTs to /api/submit (kind:'feedback') on the
//                      metrics Worker, same owner-approval-before-GitHub-
//                      issue path as a map contribution. Bare /feedback asks
//                      for the text as the next message instead of failing.
//
// Field-agent commands (stateful — require BOT_TOKEN + the VISITS KV binding).
// /agent (agents + owner) and /admin (owner only) group these into a one-tap
// menu; every command below also still works typed directly:
//   /route        — plan a walking route through the nearest stores
//   /visit        — guided store-survey flow (GPS → store → photo → questionnaire)
//   /myvisits     — an agent's own running visit count
//   /card         — set/view the payout card or IBAN /report pays out to
//   /pay          — the live pay scheme (rates from RATE_VISIT/RATE_BONUS)
//   /job          — link to the job brief
//   /cancel       — abort an in-progress /visit
//   /report       — OWNER only: totals, per-agent counts, estimated pay
//   /export       — OWNER only: CSV of all logged visits
//   /admin agents — OWNER only: every agent's tally/card/status + fire/rehire buttons
//   /admin visitors — OWNER only: unique visitors to the website (today / 7d /
//                    30d / all time + a 14-day chart), read from the metrics
//                    Worker's /api/stats. Also /admin stats, /admin analytics.
//   /admin fire <id>, /admin rehire <id> — OWNER only: revoke/restore an
//                    agent's access instantly (KV-backed, no redeploy — see
//                    docs/FIELD_AGENT.md §7)
//   /admin purge <id> — OWNER only: delete an id's logged visits and unwind
//                    the counters (for clearing owner smoke-test visits)
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
  getConfirmKeyboard, summaryText, sessionToUpdates, DAY_OPTIONS,
} from './telegram-agent-keyboards.js';

const APP_URL = 'https://www.lvivsecondhand.com/';
const METRICS_WORKER_URL = 'https://lviv-metrics.lshanalytic.workers.dev';

// Every call from this Worker to the metrics Worker goes through here.
//
// Cloudflare blocks a Worker subrequest to another Worker on the same zone: the
// public lviv-metrics.*.workers.dev URL answers HTTP 404 with "error code:
// 1042" when the caller is itself a Worker. That silently broke flash-deal
// subscribe/unsubscribe, edit claim and resolve, and the leaderboard — each sat
// inside an empty catch, so the bot simply behaved as though the metrics Worker
// had nothing to say.
//
// The METRICS service binding (telegram-bot/wrangler.toml) routes the request
// inside Cloudflare and sidesteps the restriction. The public-URL path is kept
// as a fallback for any deploy where the binding is absent, so an older
// wrangler.toml degrades to the previous behaviour instead of throwing.
function metricsFetch(env, path, init) {
  if (env.METRICS && typeof env.METRICS.fetch === 'function') {
    // The hostname is ignored by a service binding but the URL must be absolute.
    return env.METRICS.fetch(new Request(`https://metrics.internal${path}`, init));
  }
  return fetch(`${METRICS_WORKER_URL}${path}`, init);
}

// metricsFetch with the failure made impossible to ignore.
//
// The callers below each used to wrap the request in an empty catch and then
// carry on with a default value — {} or [] — which their next branch could not
// tell apart from a real answer. So a Worker that was unreachable produced
// "you are now following this store", "unsubscribed from all alerts", "this
// link is invalid" and "no contributors yet": four confident statements, none
// of them true. That is worse than an error, because the user acts on it.
//
// Returning an explicit ok flag forces the caller to decide what to say when
// the call did not happen. A 204 with no body is a success with data: null.
async function metricsCall(env, path, init) {
  try {
    const res = await metricsFetch(env, path, init);
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const raw = await res.text();
    if (!raw) return { ok: true, data: null };
    try { return { ok: true, data: JSON.parse(raw) }; }
    catch { return { ok: false, why: `HTTP ${res.status}, non-JSON` }; }
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e).slice(0, 120) };
  }
}
// One wording for "the request did not reach the server", so a user can tell
// this apart from a refusal and knows retrying is worth it.
const METRICS_DOWN = '⚠️ Сервіс тимчасово недоступний — спробуйте ще раз за хвилину.\n'
  + '⚠️ The service is temporarily unavailable — please try again in a minute.';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
// Same Ukrainian labels as scripts/build-store-pages.mjs's DAYS list — kept in
// sync by hand since one lives in the app's build step and the other here.
const DAY_NAMES_UK = { mon: 'Понеділок', tue: 'Вівторок', wed: 'Середа', thu: 'Четвер', fri: 'П’ятниця', sat: 'Субота', sun: 'Неділя' };
// Accepts a weekday in English, Ukrainian, or the common two-letter Ukrainian
// short form, so "/day mon", "/day понеділок" and "/day пн" all resolve the
// same way. Apostrophes are stripped first so "п'ятниця" and "пʼятниця" (two
// different Unicode apostrophes people actually type) both match.
const DAY_ALIASES = (() => {
  const short = { mon: 'пн', tue: 'вт', wed: 'ср', thu: 'чт', fri: 'пт', sat: 'сб', sun: 'нд' };
  const map = {};
  for (const d of DAYS) {
    map[d] = d;
    map[DAY_NAMES[d].toLowerCase()] = d;
    map[DAY_NAMES_UK[d].toLowerCase().replace(/['ʼ’]/g, '')] = d;
    map[short[d]] = d;
  }
  return map;
})();
function parseDayArg(arg) {
  const key = String(arg || '').trim().toLowerCase().replace(/['ʼ’]/g, '');
  return DAY_ALIASES[key] || null;
}

// Today's weekday in Lviv (Europe/Kyiv), as 'mon'..'sun'.
function kyivWeekday() {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', weekday: 'short' })
    .format(new Date())
    .toLowerCase()
    .slice(0, 3);
  return DAYS.includes(wd) ? wd : 'mon';
}

// ISO date (YYYY-MM-DD) `offsetDays` from today, in Lviv (Europe/Kyiv) — not
// the server's UTC date. Kyiv runs UTC+2/+3, so for a few hours every night
// Kyiv has already crossed into a new calendar day while UTC hasn't; a naive
// `new Date().toISOString()` would record the wrong day during that window.
// en-CA formats as YYYY-MM-DD directly, so no manual reassembly needed.
function isoDay(offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);
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
    '/day — pick any weekday · обрати будь-який день тижня',
    '/rare — stores that restock every 14+ days · рідко оновлювані магазини',
    '/cheap — best by-weight deals right now · найкращі ціни на вагу',
    '/submit — add your store (for owners) · додати свій магазин',
    '/feedback — tell the maintainer something · залишити відгук',
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
    '🎯 <b>QR окремого магазину · One store’s QR</b>',
    'Надішліть код магазину — пришлю його QR сюди, у чат.',
    'Send a store code and I’ll post that store’s QR right here.',
    '👉 <code>c12</code>   (або · or <code>/materials c12</code>)',
    'Кожен QR веде саме на цей магазин, не на загальну карту.',
    'Each QR opens that one store, not the general map.',
    `🗂️ <a href="${APP_URL}qr/">Список усіх кодів · All store codes</a>`,
    '',
    'Друкуй наліпки на самоклейному папері A4. · Print stickers on A4 label paper.',
    `🗺️ ${APP_URL}`,
  ].join('\n');
}

function todayText() {
  const wd = kyivWeekday();
  const today = isoDay(0);
  // A store restocking today shows up either way: a fixed weekly day, or a
  // dated restock (from /visit or a shopper's one-tap confirmation) that
  // happens to land on today. The two fields never overlap in practice, but
  // checking both means neither source of "today" data goes unseen.
  // A published calendar (restockDates) is checked too — a chain that states
  // its drop dates outright is the most reliable "today" signal there is.
  const todays = STORES.filter((s) =>
    s.restockDay === wd || s.restockDate === today
    || (Array.isArray(s.restockDates) && s.restockDates.includes(today)));
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

// Latest published restock date that is not in the future, or null. The list
// is validated sorted ascending, so a reverse scan finds it on the first hit.
function lastCalendarDate(s, todayIso) {
  if (!Array.isArray(s.restockDates)) return null;
  for (let i = s.restockDates.length - 1; i >= 0; i--) {
    if (s.restockDates[i] <= todayIso) return s.restockDates[i];
  }
  return null;
}

function cheapText() {
  const idx = DAYS.indexOf(kyivWeekday());
  const today = isoDay(0);
  // A dated restock is the more precise signal when a store has one — it
  // beats the weekday fallback, which only ever encodes 0–6 days.
  const scored = STORES
    .map((s) => {
      // A published calendar wins: it gives the exact last drop, so "days since
      // restock" stays right even across an irregular gap (HUMANA's 2026
      // schedule has a 42-day summer break among otherwise 35-day cycles).
      const last = lastCalendarDate(s, today);
      if (last) {
        return { s, days: Math.round((Date.parse(today) - Date.parse(last)) / 86400000) };
      }
      if (s.restockDate) {
        const days = Math.round((Date.parse(today) - Date.parse(s.restockDate)) / 86400000);
        return days >= 0 ? { s, days } : null;
      }
      if (s.restockDay) return { s, days: (idx - DAYS.indexOf(s.restockDay) + 7) % 7 };
      return null;
    })
    .filter(Boolean)
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

// Stores with a fixed weekly restock day — any day, not just today. This is a
// pure filter over the same `restockDay` field /today already reads: it never
// applies to dated (restock_date/restockDates) or non-weekly-cycle stores,
// same as /today's weekday branch, since a bare weekday can't place a store on
// a 14- or 35-day cycle (see getDayInfo() in index.html).
function dayText(wd) {
  const stores = STORES.filter((s) => s.restockDay === wd);
  const label = DAY_NAMES[wd];
  const labelUk = DAY_NAMES_UK[wd];
  if (!stores.length) {
    return featuredBlock() + [
      `📦 <b>No stores have a fixed ${label} (${labelUk}) restock day on record.</b>`,
      'Спробуйте інший день · Try another day: /day mon, /day tue, /day wed…',
      '',
      `🐢 Rarely-restocking stores instead: /rare`,
    ].join('\n');
  }
  const blocks = stores.map((s) => storeBlock(s, `🗓️ Restocks every ${label} · Щотижня в ${labelUk.toLowerCase()}`)).join('\n\n');
  return featuredBlock() + [
    `📦 <b>Fixed ${label} (${labelUk}) restocks</b> — ${stores.length} store${stores.length > 1 ? 's' : ''}:`,
    '',
    blocks,
  ].join('\n');
}

function dayPickerHelp() {
  const lines = DAYS.map((d) => `/day ${d} — ${DAY_NAMES[d]} · ${DAY_NAMES_UK[d]}`);
  return [
    '📅 <b>Pick a day · Оберіть день</b>',
    'Which day should I check for fixed weekly restocks?',
    '',
    ...lines,
  ].join('\n');
}

// "Rarely restocks" — any store on a longer-than-weekly cycle (14, 35 days…).
// Pure read of the existing `cycle` field, sorted slowest-first so the chains
// shoppers ask about least often ("does this place even get new stock?") lead.
function rareText() {
  const rare = STORES.filter((s) => s.cycle > 7).sort((a, b) => b.cycle - a.cycle);
  if (!rare.length) {
    return `No rarely-restocking stores on record. Open the full map: ${APP_URL}`;
  }
  const blocks = rare.map((s) => storeBlock(s, `🐢 Restocks every ${s.cycle} days`)).join('\n\n');
  return featuredBlock() + [
    `🐢 <b>Rarely-restocking stores</b> (14+ day cycle) — ${rare.length} store${rare.length > 1 ? 's' : ''}:`,
    '',
    blocks,
  ].join('\n');
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

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT REPLY-KEYBOARD (#209, Phase G 3/3) — a one-tap menu layered on
// top of the slash commands above, entered via /start. Every button just
// sends its own label back as an ordinary text message, so the whole thing
// stays in the stateless, no-BOT_TOKEN-needed tier (same as /today/day/rare):
// Telegram keeps whatever reply_markup a chat last received, so only /start
// and the two taps that switch keyboards (day submenu ⇄ main menu) need to
// resend one — everything else can omit it and the visible keyboard just
// stays put. 💬 Залишити відгук is the one exception: it re-dispatches to
// handleFeedbackFlow (Feature 7), which does need BOT_TOKEN + VISITS, exactly
// as bare /feedback already does.
// ─────────────────────────────────────────────────────────────────────────────
const MENU_DAY = '📅 За днем тижня';
const MENU_CHEAP = '💰 Найдешевше зараз';
const MENU_RARE = '🐢 Рідко оновлюють';
const MENU_ADD = '➕ Додати магазин';
const MENU_FEEDBACK = '💬 Залишити відгук';
const MENU_HELP = '❓ Довідка';
const MENU_BACK = '⬅️ Назад';
// Extra row, appended only for the owner/agents (see mainMenuMarkupFor) — the
// public rows above stay identical for everyone else. Same labels cmdAgentMenu
// and cmdAdminMenu already use, so this reads as "the same menu, one tap
// closer" rather than a third way of naming the same thing.
const MENU_AGENT = '🧭 Меню агента · Agent menu';
const MENU_ADMIN = '⚙️ Адмін-меню · Admin menu';

function kbMarkup(rows) {
  return { keyboard: rows.map((row) => row.map((t) => ({ text: t }))), resize_keyboard: true };
}
const MAIN_MENU_MARKUP = kbMarkup([
  [MENU_DAY, MENU_CHEAP],
  [MENU_RARE, MENU_ADD],
  [MENU_FEEDBACK, MENU_HELP],
]);
// isOwner/isAgent gate real access everywhere these menus are actually used
// (handleVisit's command router) — this only controls whether the button is
// worth showing, so a shopper's keyboard never grows a row that would just
// bounce them with "not authorized".
function mainMenuMarkupFor(isOwner, isAgent) {
  const extra = [];
  if (isAgent || isOwner) extra.push(MENU_AGENT);
  if (isOwner) extra.push(MENU_ADMIN);
  if (!extra.length) return MAIN_MENU_MARKUP;
  return kbMarkup([
    [MENU_DAY, MENU_CHEAP],
    [MENU_RARE, MENU_ADD],
    [MENU_FEEDBACK, MENU_HELP],
    extra,
  ]);
}
// Same short Ukrainian day labels as the bounty flow's DAY_OPTIONS
// (telegram-agent-keyboards.js), reused here rather than duplicated.
const DAY_MENU_MARKUP = kbMarkup([
  DAY_OPTIONS.slice(0, 4).map((o) => o.label),
  DAY_OPTIONS.slice(4).map((o) => o.label).concat([MENU_BACK]),
]);
const DAY_LABEL_TO_CODE = Object.fromEntries(DAY_OPTIONS.map((o) => [o.label, o.code]));

function daySubmenuPrompt() {
  return '📅 <b>Оберіть день · Pick a day</b>';
}

// Map a public command OR a tapped menu-keyboard button to { text, markup }.
// markup is only set when the visible keyboard should change; omitting it
// leaves whatever keyboard the chat already has in place. isOwner/isAgent
// only affect which keyboard comes back (mainMenuMarkupFor) — actual access
// to /agent and /admin is still enforced where those commands are handled
// (handleVisit), same as if someone typed them without ever seeing a button.
function replyFor(text, isOwner, isAgent) {
  const trimmed = text.trim();
  const menuMarkup = mainMenuMarkupFor(isOwner, isAgent);

  // Reply-keyboard taps arrive as plain text identical to the button label —
  // checked before the slash-command parse below since none of these start
  // with "/".
  if (trimmed === MENU_DAY) return { text: daySubmenuPrompt(), markup: DAY_MENU_MARKUP };
  if (trimmed === MENU_BACK) return { text: 'Головне меню · Main menu', markup: menuMarkup };
  if (trimmed in DAY_LABEL_TO_CODE) return { text: dayText(DAY_LABEL_TO_CODE[trimmed]), markup: DAY_MENU_MARKUP };
  if (trimmed === MENU_CHEAP) return { text: cheapText() };
  if (trimmed === MENU_RARE) return { text: rareText() };
  if (trimmed === MENU_ADD) return { text: submitText() };
  if (trimmed === MENU_HELP) return { text: helpText(), markup: menuMarkup };
  // MENU_FEEDBACK, MENU_AGENT and MENU_ADMIN are deliberately not handled
  // here — handleFeedbackFlow (Feature 7) and handleVisit's command router
  // recognize them too and run before this stateless fallback.

  // Strip a leading /command, tolerate "/today@BotName" and trailing args.
  const m = /^\/([a-z]+)(?:@\w+)?/i.exec(trimmed);
  if (!m) return { text: "I only understand commands. Send /help to see them." };
  switch (m[1].toLowerCase()) {
    case 'start':
    case 'help':
      return { text: helpText(), markup: menuMarkup };
    case 'today':
      return { text: todayText() };
    case 'day': {
      const arg = trimmed.replace(/^\/day(?:@\w+)?\s*/i, '').trim();
      if (!arg) return { text: dayPickerHelp() };
      const wd = parseDayArg(arg);
      if (!wd) return { text: `Не розпізнав день · Didn't recognize that day: "${arg}".\n\n` + dayPickerHelp() };
      return { text: dayText(wd) };
    }
    case 'rare':
      return { text: rareText() };
    case 'cheap':
      return { text: cheapText() };
    case 'submit':
    case 'owner':
      return { text: submitText() };
    case 'materials':
    case 'print':
    case 'flyers':
      return { text: materialsText() };
    default:
      return { text: 'Unknown command. Send /help to see what I can do.' };
  }
}

// Stateless reply: answer inside the webhook HTTP response (no bot token needed).
function sendMessage(chatId, text, markup) {
  const body = { method: 'sendMessage', chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (markup) body.reply_markup = markup;
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
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

// Firing an agent doesn't touch AGENT_IDS (that's a Worker secret — editing it
// needs a redeploy). Instead a fired id is recorded in KV and subtracted from
// agentIds below, so /admin fire takes effect immediately and /admin rehire
// reverses it just as fast, no redeploy either way.
const FIRED_KEY = 'fired_agents';
async function getFiredIds(env) {
  if (!env.VISITS) return [];
  try { return (await env.VISITS.get(FIRED_KEY, { type: 'json' })) || []; } catch { return []; }
}
async function setFiredIds(env, ids) {
  await env.VISITS.put(FIRED_KEY, JSON.stringify(ids));
}

async function cfg(env) {
  const allAgentIds = String(env.AGENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const firedIds = await getFiredIds(env);
  const firedSet = new Set(firedIds.map(String));
  return {
    enabled: Boolean(env.BOT_TOKEN && env.VISITS),
    ownerId: String(env.OWNER_ID || ''),
    agentIds: allAgentIds.filter((id) => !firedSet.has(id)),
    allAgentIds, // unfiltered — /admin agents needs to show fired ones too
    firedIds,
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
  const saved = await metricsCall(env, '/api/sub', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, chatId }),
  });
  if (!saved.ok) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: METRICS_DOWN });
    return true;
  }
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
  const cleared = await metricsCall(env, '/api/unsub-all', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  });
  if (!cleared.ok) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: METRICS_DOWN });
    return true;
  }
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
  const claim = await metricsCall(env, '/api/edit/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: m[1], chatId, name }),
  });
  if (!claim.ok) {
    // Falling through would have told the contributor their link was invalid,
    // sending them to check a link that is fine.
    await tg(env, 'sendMessage', { chat_id: chatId, text: METRICS_DOWN });
    return true;
  }
  const out = claim.data || {};
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
  const board = await metricsCall(env, '/api/leaderboard');
  if (!board.ok) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: METRICS_DOWN });
    return true;
  }
  const rows = Array.isArray(board.data) ? board.data : [];
  if (!rows.length) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '🏆 Поки що немає учасників. · No contributors yet.' });
    return true;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${esc(r.name || r.chat_id)} — ${r.points} pts`);
  await tg(env, 'sendMessage', { chat_id: chatId, text: `🏆 <b>Leaderboard</b>\n\n${lines.join('\n')}`, parse_mode: 'HTML' });
  return true;
}

// General app/bot feedback (#209/#210), not tied to any store. POSTs to the
// metrics Worker's /api/submit as kind:'feedback' — same pending-until-
// approved path a map contribution or owner submission already takes: the
// owner gets a ✅/❌ in Telegram, and only approval opens a GitHub issue (see
// worker/worker.js's renderSubmissionIssue). Unlike Features 5/6 above, this
// needs VISITS as well as BOT_TOKEN — remembering "this chat typed bare
// /feedback and owes the next message" is exactly what the QR-poster wait
// flag two features down does, so the same short-lived-KV-flag shape is used
// here rather than inventing a session. Checked directly against the env
// vars rather than through cfg().enabled: feedback isn't a field-agent
// feature and has no business gated behind agent/owner ids.
const FEEDBACK_WAIT_TTL = 300; // 5 min
const feedbackWaitKey = (uid) => `fbwait:${uid}`;

async function submitFeedback(env, ctx, feedbackText) {
  const { chatId, from } = ctx;
  const text = String(feedbackText || '').trim().slice(0, 2000);
  if (!text) return false;
  const username = (from && (from.username || from.first_name)) || null;
  const sent = await metricsCall(env, '/api/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'feedback', payload: { text, chatId: String(chatId), username } }),
  });
  if (!sent.ok) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: METRICS_DOWN });
    return true;
  }
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '💬 Дякуємо! Ваш відгук надіслано власнику на перегляд.\n💬 Thanks — your feedback was sent to the maintainer for review.',
  });
  return true;
}

async function handleFeedbackFlow(env, ctx) {
  if (!env.BOT_TOKEN || !env.VISITS) return false;
  const { userId, chatId, text } = ctx;
  const raw = String(text || '').trim();
  const command = raw ? (/^\/([a-z]+)(?:@\w+)?/i.exec(raw) || [])[1]?.toLowerCase() : null;
  // The reply-keyboard's 💬 button is just bare /feedback by another name —
  // a button tap can never carry inline text, so it always takes the "ask for
  // the next message" branch below rather than the /feedback <text> shortcut.
  if (command === 'feedback' || raw === MENU_FEEDBACK) {
    const arg = command === 'feedback' ? raw.replace(/^\/feedback(?:@\w+)?\s*/i, '').trim() : '';
    if (arg) return await submitFeedback(env, ctx, arg);
    await env.VISITS.put(feedbackWaitKey(userId), '1', { expirationTtl: FEEDBACK_WAIT_TTL });
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: "💬 Напишіть свій відгук одним повідомленням — я передам його власнику.\n💬 Type your feedback as your next message — I'll pass it on to the maintainer.",
    });
    return true;
  }
  // Not a command — might be the pending feedback text the prompt above asked
  // for. Bail on anything command-shaped so this can never swallow an
  // unrelated command as feedback.
  if (!raw || raw.startsWith('/')) return false;
  let waiting = null;
  try { waiting = await env.VISITS.get(feedbackWaitKey(userId)); } catch (e) {}
  if (!waiting) return false;
  await env.VISITS.delete(feedbackWaitKey(userId));
  return await submitFeedback(env, ctx, raw);
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

  // Taps on the /agent and /admin submenus (see cmdAgentMenu/cmdAdminMenu) —
  // route straight into the same handlers the equivalent typed command uses.
  if (kind === 'ag' || kind === 'ad') {
    const isOwner2 = c.ownerId && String(uid) === c.ownerId;
    const isAgent2 = c.agentIds.includes(String(uid));
    if (kind === 'ag') {
      if (!(isAgent2 || isOwner2)) return;
      if (val === 'route' || val === 'visit') {
        if (!isAgent2) { await say(env, chatId, notAgentMsg(uid)); return; }
        await (val === 'route' ? cmdRoute(env, uid, chatId) : cmdVisit(env, uid, chatId));
        return;
      }
      if (val === 'myvisits') { if (!isAgent2) return; await cmdMyVisits(env, uid, chatId); return; }
      if (val === 'card') { if (!isAgent2) return; await cmdCard(env, uid, chatId); return; }
      if (val === 'pay') { await cmdPay(env, c, chatId); return; }
      if (val === 'job') { await cmdJob(env, chatId); return; }
      if (val === 'cancel') { await cmdCancel(env, uid, chatId); return; }
      return;
    }
    if (!isOwner2) return;
    if (val === 'report') { await ownerReport(env, c, chatId); return; }
    if (val === 'export') { await ownerExport(env, chatId); return; }
    if (val === 'agents') { await cmdAdminAgents(env, c, chatId); return; }
    if (val === 'visitors') { await cmdAdminVisitors(env, chatId); return; }
    if (val === 'fireabort') { await tg(env, 'sendMessage', { chat_id: chatId, text: 'Скасовано. · Cancelled.' }); return; }
    if (val.startsWith('firereq:')) { await cmdFireRequest(env, c, chatId, val.slice(8)); return; }
    if (val.startsWith('firedo:')) { await cmdFireDo(env, c, chatId, val.slice(7)); return; }
    if (val.startsWith('rehire:')) { await cmdRehire(env, c, chatId, val.slice(7)); return; }
    if (val.startsWith('purgedo:')) { await cmdPurgeDo(env, c, chatId, val.slice(8)); return; }
    return;
  }

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
      const res = await metricsFetch(env, '/api/edit/resolve', {
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
    // A restock weekday only pins down a store's position in a 7-day cycle
    // (see getDayInfo() in index.html) — asking it for a 14- or 35-day cycle
    // would collect an answer the map can never use.
    if (val === '7') {
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

// Telegram command menus. Everyone gets PUBLIC_CMDS; agents additionally get a
// single /agent entry (opens an inline submenu — see cmdAgentMenu) and the
// owner also gets /admin (see cmdAdminMenu), instead of every task getting its
// own top-level command. Bump CMD_VER to force a re-sync after editing the
// lists. Self-managing → no BotFather /setcommands needed.
const CMD_VER = 'v10';
// Telegram renders setMyCommands as one flat list in exactly the order given,
// with no headers or sections available. So the menu is categorised the only
// two ways it can be: the order groups related commands into contiguous bands,
// and a leading emoji per band makes the boundary visible while scrolling.
// The emoji is chosen per band, not per command, so the eye can pick out a band
// without reading — which is the whole point of grouping eighteen entries.
//
// Public band, in the order a shopper needs them: find stock, then find a
// bargain, then the two owner-facing entries, then community, then settings.
const PUBLIC_CMDS = [
  { command: 'today', description: '🛍 Магазини із завезенням сьогодні' },
  { command: 'day', description: '🛍 Обрати будь-який день тижня' },
  { command: 'rare', description: '🛍 Рідко оновлювані магазини' },
  { command: 'cheap', description: '🛍 Найкращі ціни на вагу зараз' },
  { command: 'submit', description: '🏪 Додати свій магазин (власникам)' },
  { command: 'materials', description: '🏪 Матеріали для друку: флаєри, наліпки' },
  { command: 'feedback', description: '💬 Залишити відгук власнику' },
  { command: 'leaderboard', description: '🏆 Топ учасників за балами' },
  { command: 'stop', description: '🔕 Вимкнути всі сповіщення' },
  { command: 'help', description: 'ℹ️ Команди та інформація' },
];
// Field-work band. All gated on isAgent in the router, so listing them for
// anyone else would only advertise a refusal. Bilingual here and in the owner
// band below, unlike the public band: these are read by the owner too.
const AGENT_CMDS = [
  { command: 'agent', description: '🧭 Меню агента · Agent menu' },
  { command: 'visit', description: '🧭 Записати відвідування магазину' },
  { command: 'route', description: '🧭 Маршрут обходу від вашої локації' },
  { command: 'myvisits', description: '🧭 Мої відвідування та заробіток' },
  { command: 'pay', description: '🧭 Ставки оплати · Pay rates' },
  { command: 'card', description: '🧭 Картка для виплат · Payout card' },
  { command: 'job', description: '🧭 Опис роботи · Job brief' },
  { command: 'cancel', description: '🧭 Скасувати активну дію · Cancel' },
];
// Owner band — last, because it is the one nobody else ever sees.
const OWNER_CMDS = [
  { command: 'admin', description: '⚙️ Адмін-меню · Admin menu' },
  { command: 'report', description: '⚙️ Звіт: відвідування та оплата' },
  { command: 'export', description: '⚙️ CSV усіх відвідувань' },
];
async function syncBotCommands(env, userId, isOwner, isAgent) {
  // Record the version ONLY when Telegram accepted the menu.
  //
  // tg() returns the API's response body and never throws, so a rejected
  // setMyCommands — a malformed description, a duplicate command, a rate limit —
  // used to be followed by the KV write regardless. That marked the version
  // done, and since the sync is skipped once the version matches, the menu would
  // stay stale forever while every later run believed it had succeeded. The one
  // failure mode this function has, it could not report or recover from.
  const publish = async (key, params) => {
    const res = await tg(env, 'setMyCommands', params);
    if (res && res.ok) await env.VISITS.put(key, CMD_VER);
    return !!(res && res.ok);
  };
  // Public default menu — set once globally.
  if ((await env.VISITS.get('cmds:default')) !== CMD_VER) {
    await publish('cmds:default', { commands: PUBLIC_CMDS });
  }
  // Extended menu — only for owner/agents, scoped to their own chat, once each.
  if (!(isOwner || isAgent)) return;
  if ((await env.VISITS.get('cmds:' + userId)) === CMD_VER) return;
  const cmds = PUBLIC_CMDS.concat(AGENT_CMDS, isOwner ? OWNER_CMDS : []);
  await publish('cmds:' + userId, { commands: cmds, scope: { type: 'chat', chat_id: userId } });
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

// Interpret bilingual button text into stored values. These back a fixed
// reply keyboard, so a tap always matches — but Telegram lets someone type
// instead of tapping, so unrecognised text returns null rather than a silent
// guess; the question-step handler below reprompts on null instead of
// recording e.g. an accidental typo as "no".
function readPricing(t) {
  const n = norm(t);
  if (n.includes('вага') || n.includes('weight')) return 'kg';
  if (n.includes('штук') || n.includes('itemi')) return 'item';
  if (n.includes('обид') || n.includes('both')) return 'both';
  if (n.includes('не знаю') || n.includes('unknown')) return 'unknown';
  return null;
}
function readSize(t) {
  const n = norm(t);
  if (n.includes('s ') || n.includes('мал') || n.includes('small')) return 'S';
  if (n.includes('m ') || n.includes('серед') || n.includes('medium')) return 'M';
  if (n.includes('l ') || n.includes('вел') || n.includes('large')) return 'L';
  return null;
}
// Loose yes-detection for the free-text /visit confirm step (any phrasing
// containing an affirmative reads as yes; unmatched text falls through to
// that step's own reprompt, so no ambiguity there).
const readYes = (t) => /так|yes|✅/i.test(String(t));
// Strict yes/no for the poster/contact questions — unlike readYes() above,
// this returns null for anything that doesn't clearly match either option,
// so the caller reprompts instead of defaulting an unrecognised answer to "no".
function readYesNo(t) {
  const s = String(t || '');
  if (/так|yes|✅/i.test(s)) return true;
  if (/ні|no|❌/i.test(s)) return false;
  return null;
}
// A payout card number (16 digits, spaces/dashes stripped) or a Ukrainian
// IBAN. Only shape-checked, not a Luhn/bank check — this is a destination the
// owner pays to by hand, not a card processed by this app.
function readCardNumber(t) {
  const raw = String(t || '').trim().replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(raw)) return raw;
  if (/^UA\d{27}$/i.test(raw)) return raw.toUpperCase();
  return null;
}
const cardKey = (uid) => `card:${uid}`;

const ROUTE_SIZE = 12;        // a day's zone, matching the handbook's 10–15
const DUP_WINDOW_DAYS = 30;   // fallback when a store's own cycle is unknown

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
  session.data.nearby = near.map(({ s }) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, cycle: s.cycle }));
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
        // A store's own cycle length, when known, is the true "same survey
        // cycle" window — a fixed 30 days under-warns a 35-day-cycle store
        // and over-warns a 7-day one.
        const window = (store.cycle && store.cycle > 0) ? store.cycle : DUP_WINDOW_DAYS;
        if (days >= 0 && days < window) session.data.dupDays = days;
      }
    } catch (e) {}
  }
  session.step = 'photo';
  await putSession(env, uid, session);
  const warn = session.data.distM != null && session.data.distM > NEAR_METERS
    ? `\n⚠️ ~${session.data.distM} м від точки на карті — переконайтесь, що ви біля магазину. · ~${session.data.distM} m from the map pin.`
    : '';
  const dup = session.data.dupDays != null
    ? `\n⚠️ Цей магазин уже обстежували <b>${session.data.dupDays} дн. тому</b> — база за візит НЕ буде нарахована (бонус — можна). · Already surveyed ${session.data.dupDays} day(s) ago — the visit base won't be paid (a new bonus still can be).`
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
  // "No double-pay" (FIELD_AGENT.md §2): a re-survey inside the store's own
  // cycle (see pickStore()'s dupDays) doesn't earn a second visit base — it
  // can still earn a bonus for a genuinely new poster/sign-up.
  const isDup = d.dupDays != null;
  if (!isDup) {
    await bump(env, 'total');
    await bump(env, 'agent:' + uid);
  }
  if (bonusUnits) await bump(env, 'bonus', bonusUnits);
  await clearSession(env, uid);

  const earned = (isDup ? 0 : c.rateVisit) + bonusUnits * c.rateBonus;
  const fragments = [];
  if (!isDup) fragments.push(`+₴${c.rateVisit}`);
  if (bonusUnits) fragments.push(`+₴${bonusUnits * c.rateBonus} бонус/bonus`);
  const payLine = fragments.length
    ? `💵 ${fragments.join(' ')} = <b>₴${earned}</b>`
    : '⏭️ Нічого не нараховано — цей магазин уже обстежували цього циклу, нового бонусу немає. · Nothing earned — already surveyed this cycle, no new bonus.';
  const mine = Number((await env.VISITS.get('count:agent:' + uid)) || 0);
  await say(env, chatId,
    `✅ <b>Візит записано! · Visit logged!</b>\n` +
    `${payLine}\n` +
    `📊 Ваших візитів усього · Your total visits: <b>${mine}</b>\n\n` +
    `Наступний магазин — /visit · Next store — /visit`);

  // Real-time push to the owner (photo + summary) for verification, if configured.
  if (c.ownerId) {
    const isNewStore = !(rec.store && rec.store.id);
    let caption = summary(session).replace('🧾 <b>Перевірте візит · Review visit</b>', `🆕 <b>Візит · Visit</b> — ${esc(rec.agentName)}`);
    if (isNewStore) {
      caption += '\n\n🆕 Новий магазин — ще немає в stores.json, потрібно додати вручну. · New store — not in stores.json yet, needs adding by hand.';
    }
    // A survey collects exactly the fields stores.json holds, so offer to put
    // them on the map right here rather than leaving the owner to retype a CSV.
    // Only for stores that already exist — dispatchMapPatch() can only patch
    // an existing entry, not create one, hence the note above for a new store.
    const patch = visitToUpdates(rec);
    const kb = (!isNewStore && Object.keys(patch).length)
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
  // The owner is often also listed in AGENT_IDS (to smoke-test /visit) — their
  // own visits shouldn't inflate the payroll total below.
  const ownerVisits = (c.ownerId && c.agentIds.includes(c.ownerId))
    ? Number((await env.VISITS.get('count:agent:' + c.ownerId)) || 0) : 0;
  const lines = ['📊 <b>Field report · Звіт</b>', `Visits logged: <b>${total}</b>`, `Bonus events: <b>${bonus}</b>`];
  // Per-agent counts, with their payout card if they've set one.
  for (const id of c.agentIds) {
    const n = Number((await env.VISITS.get('count:agent:' + id)) || 0);
    if (!n) continue;
    const card = await env.VISITS.get(cardKey(id));
    const cardNote = id === c.ownerId ? ' (owner — excluded from pay below)' : (card ? ` 💳 <code>${esc(card)}</code>` : ' ⚠️ no payout card');
    lines.push(`• agent <code>${id}</code>${cardNote}: ${n} visits`);
  }
  const payableVisits = total - ownerVisits;
  const pay = payableVisits * c.rateVisit + bonus * c.rateBonus;
  lines.push('', `💵 Estimated pay: <b>₴${pay}</b>  (₴${c.rateVisit}/visit × ${payableVisits}${ownerVisits ? `, excludes ${ownerVisits} owner visit(s)` : ''} + ₴${c.rateBonus}/bonus × ${bonus})`);
  lines.push('Note: bonus events aren’t tracked per-agent, so an owner smoke-test bonus (if any) is still included above.');
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
const JOB_BRIEF_URL = 'https://www.lvivsecondhand.com/jobs/';
function jobText() {
  return [
    '📋 <b>Опис вакансії · Job brief</b>',
    'Повний опис ролі, як це працює та схема оплати (UA/EN):',
    'Full role, workflow and pay scheme:',
    '',
    `👉 <a href="${JOB_BRIEF_URL}">Відкрити опис вакансії · Open the job brief</a>`,
    '',
    'Питання? Пишіть власнику напряму. · Questions? Message the owner directly.',
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

// Individual agent/admin actions -- shared between typed commands and taps on
// the /agent and /admin inline submenus (see cmdAgentMenu/cmdAdminMenu below
// and the 'ag'/'ad' callback_data handling in handleAgentCallback).
async function cmdCancel(env, userId, chatId) {
  const session = await getSession(env, userId);
  if (!session) return false;
  await clearSession(env, userId);
  await say(env, chatId, 'Скасовано. · Cancelled. /visit щоб почати знову.');
  return true;
}
async function cmdMyVisits(env, userId, chatId) {
  const n = Number((await env.VISITS.get('count:agent:' + userId)) || 0);
  await say(env, chatId, `📊 Ваших візитів усього · Your total visits: <b>${n}</b>`);
}
async function cmdPay(env, c, chatId) {
  await say(env, chatId, payText(c));
}
// `arg` is whatever followed "/card " (undefined from the /agent menu button
// — that variant just shows the current status/instructions).
async function cmdCard(env, userId, chatId, arg) {
  const typed = String(arg || '').trim();
  if (!typed) {
    const cur = await env.VISITS.get(cardKey(userId));
    await say(env, chatId, cur
      ? `💳 Картка для виплат · Payout card: <code>${esc(cur)}</code>\nЩоб змінити · To change: <code>/card 0000000000000000</code>`
      : '💳 Картку для виплат ще не вказано. · No payout card on file yet.\n' +
        'Надішліть номер картки (16 цифр) або IBAN · Send your card number (16 digits) or IBAN:\n<code>/card 0000000000000000</code>');
    return;
  }
  const card = readCardNumber(typed);
  if (!card) {
    await say(env, chatId, '⚠️ Не розпізнав номер картки. Введіть 16 цифр картки або IBAN (UA...). · Didn’t recognise that — enter a 16-digit card number or a UA IBAN.');
    return;
  }
  await env.VISITS.put(cardKey(userId), card);
  await say(env, chatId, `✅ Збережено картку для виплат · Payout card saved: <code>${esc(card)}</code>`);
}
async function cmdJob(env, chatId) {
  await say(env, chatId, jobText());
}

// "Waiting for a store id" flag, armed by a bare /materials. Short TTL: this
// exists to make one follow-up message work, not to hold state for the day.
const qrWaitKey = (uid) => `qrwait:${uid}`;
const QR_WAIT_TTL = 300; // 5 min

// Send one store's QR as a photo, plus the link to its printable A5 poster.
// The image is a static file built by scripts/build-qr-posters.mjs — Telegram
// fetches it by URL, so nothing is rendered at request time.
async function cmdStoreQr(env, chatId, rawId) {
  const id = String(rawId || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const store = STORES.find((s) => s.id.toLowerCase() === id);
  if (!store) {
    await say(env, chatId,
      `🤷 Не знайшов магазин <code>${esc(rawId)}</code>. · No store with that id.\n` +
      `Формат — літера + число, напр. <code>c12</code>, <code>h5</code>. · Format is letter+number.\n` +
      `Усі коди · All ids: ${APP_URL}qr/`);
    return;
  }
  const code = store.id.toUpperCase();
  const photo = `${APP_URL}qr/${store.id}/qr.png`;
  const res = await tg(env, 'sendPhoto', {
    chat_id: chatId,
    photo,
    parse_mode: 'HTML',
    caption:
      `🎯 <b>${esc(code)}</b> — QR цього магазину · this store's QR\n` +
      `Веде на · Opens: ${APP_URL}?store=${encodeURIComponent(store.id)}\n\n` +
      `🖨️ <a href="${APP_URL}qr/${store.id}/">Плакат A5 для друку · Printable A5 poster</a>`,
  });
  // Telegram refuses a photo it cannot fetch (e.g. Pages still deploying).
  // Fall back to links rather than leaving the agent with silence.
  if (res && res.ok === false) {
    await say(env, chatId,
      `🎯 <b>${esc(code)}</b>\n` +
      `🖨️ <a href="${APP_URL}qr/${store.id}/">Плакат A5 · A5 poster</a>\n` +
      `🖼️ <a href="${photo}">QR (PNG)</a>`);
  }
}
async function cmdRoute(env, userId, chatId) {
  await putSession(env, userId, { step: 'route_loc', qi: 0, data: {} });
  await say(env, chatId,
    '🧭 <b>Маршрут на сьогодні · Today\u2019s route</b>\n' +
    'Надішліть свою <b>геолокацію</b> — складу маршрут по найближчих магазинах.\n' +
    'Share your <b>location</b> and I\u2019ll plan a walking route through the nearest stores.\n\n' +
    '/cancel щоб вийти · to abort');
}
async function cmdVisit(env, userId, chatId, session) {
  if (session === undefined) session = await getSession(env, userId);
  // Don't silently discard a half-finished survey -- losing a photo and six
  // answers to a mistyped command is the worst thing this flow can do.
  if (session && session.step !== 'route_loc' && session.step !== 'done') {
    session.step = 'resume_ask';
    await putSession(env, userId, session);
    await say(env, chatId,
      '⚠️ У вас є незавершений візит' + (session.data.store ? ` — <b>${esc(session.data.store.name)}</b>` : '') + '.\n' +
      'You have a survey in progress. Continue it, or start over?',
      [['▶️ Продовжити / Continue', '🔄 Почати заново / Restart']]);
    return;
  }
  await startVisit(env, userId, chatId);
}
async function cmdAgentMenu(env, chatId, isAgent) {
  const rows = [];
  if (isAgent) {
    rows.push([{ text: '🧭 Маршрут · Route', callback_data: 'ag:route' }]);
    rows.push([{ text: '📝 Візит · Visit', callback_data: 'ag:visit' }]);
    rows.push([{ text: '📊 Мої візити · My visits', callback_data: 'ag:myvisits' }]);
    rows.push([{ text: '💳 Картка для виплат · Payout card', callback_data: 'ag:card' }]);
  }
  rows.push([{ text: '💰 Оплата · Pay', callback_data: 'ag:pay' }]);
  rows.push([{ text: '📋 Вакансія · Job', callback_data: 'ag:job' }]);
  rows.push([{ text: '❌ Скасувати активну дію · Cancel', callback_data: 'ag:cancel' }]);
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
    text: '🧭 <b>Меню агента · Agent menu</b>', reply_markup: { inline_keyboard: rows } });
}
async function cmdAdminMenu(env, chatId) {
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
    text: '⚙️ <b>Адмін-меню · Admin menu</b>', reply_markup: { inline_keyboard: [
      [{ text: '📈 Звіт · Report', callback_data: 'ad:report' }],
      [{ text: '📊 Відвідувачі · Visitors', callback_data: 'ad:visitors' }],
      [{ text: '📤 Експорт · Export', callback_data: 'ad:export' }],
      [{ text: '👥 Агенти · Agents', callback_data: 'ad:agents' }],
    ] } });
}

// Unique visitors to the website, read from the metrics Worker's /api/stats.
//
// "Unique" means one person per day: the Worker stores a day-scoped hash of the
// visitor's IP and never the IP itself, so the same person on Monday and Tuesday
// counts once each. That makes the 7- and 30-day figures visit-days rather than
// distinct people, and the wording below says so — a number labelled "unique
// visitors" that quietly means something else is worse than no number.
async function cmdAdminVisitors(env, chatId) {
  if (!env.ADMIN_KEY) {
    await tg(env, 'sendMessage', { chat_id: chatId,
      text: '⚠️ ADMIN_KEY не налаштовано на metrics Worker. · ADMIN_KEY is not set on the metrics Worker.' });
    return;
  }
  // Plain fetch with no `cf` options — the same shape as the /api/edit/resolve
  // call above, which is the one Worker-to-Worker request in this file already
  // proven in production. A `cf: { cacheTtl }` here threw outright.
  //
  // The body is read as text and parsed by hand so that a non-JSON reply (a
  // Cloudflare error page, an HTML 5xx) reports its status and first line
  // instead of collapsing into a generic "could not reach", which says nothing
  // about whether the request failed, the route is missing, or the key is wrong.
  let s;
  try {
    const res = await metricsFetch(env, '/api/stats', {
      headers: { 'X-Admin-Key': env.ADMIN_KEY },
    });
    const raw = await res.text();
    try {
      s = JSON.parse(raw);
    } catch {
      await tg(env, 'sendMessage', { chat_id: chatId,
        text: `⚠️ Metrics Worker відповів не-JSON (HTTP ${res.status}). · Non-JSON reply (HTTP ${res.status}):\n${esc(raw.slice(0, 200))}` });
      return;
    }
  } catch (e) {
    await tg(env, 'sendMessage', { chat_id: chatId,
      text: `⚠️ Не вдалося зʼєднатися з metrics Worker. · Could not reach the metrics Worker.\n${esc(String((e && e.message) || e).slice(0, 200))}` });
    return;
  }
  if (!s || !s.ok) {
    const why = s && s.reason === 'unauthorized'
      ? 'ADMIN_KEY не збігається між ботом і metrics Worker. · ADMIN_KEY does not match between the bot and the metrics Worker.'
      : `Помилка: ${esc(String((s && s.reason) || 'unknown'))}`;
    await tg(env, 'sendMessage', { chat_id: chatId, text: `⚠️ ${why}` });
    return;
  }

  // A 14-day bar chart in text. Blocks are scaled to the busiest day in the
  // window so the shape reads even when the absolute numbers are small, which
  // they will be early on.
  const rows = Array.isArray(s.daily) ? s.daily.slice(0, 14) : [];
  const peak = rows.reduce((m, r) => Math.max(m, r.n || 0), 0);
  const chart = rows.length
    ? rows.map((r) => {
        const bars = peak > 0 ? Math.max(1, Math.round((r.n / peak) * 12)) : 0;
        return `<code>${esc(r.day.slice(5))} ${'█'.repeat(bars).padEnd(12, '·')} ${String(r.n).padStart(4)}</code>`;
      }).join('\n')
    : '<i>Поки що немає даних. · No data yet.</i>';

  const lines = [
    '📊 <b>Унікальні відвідувачі · Unique visitors</b>',
    '',
    `<b>Сьогодні · Today:</b> ${s.today}`,
    `<b>7 днів · Last 7 days:</b> ${s.last7}`,
    `<b>30 днів · Last 30 days:</b> ${s.last30}`,
    `<b>За весь час · All time:</b> ${s.allTime}`,
    '',
    chart,
    '',
    `<i>Один відвідувач на день. Показники за 7/30 днів — це людино-дні, а не окремі люди.</i>`,
    `<i>One visitor per day; the 7- and 30-day figures are visit-days, not distinct people.</i>`,
  ];
  if (s.since) lines.push('', `<i>Облік ведеться з ${esc(s.since)}. · Counting since ${esc(s.since)}.</i>`);
  lines.push(`<i>Подій за 30 днів · Events in 30 days: ${s.events30}</i>`);

  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n') });
}

// Lists every id in AGENT_IDS (owner included, marked separately) with their
// running tally, payout card, and active/fired status — plus a one-tap
// fire/rehire button per agent. This is the "who has access" view an owner
// checks before firing someone, so the final tally is right there.
async function cmdAdminAgents(env, c, chatId) {
  if (!c.allAgentIds.length) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Немає налаштованих агентів (AGENT_IDS порожній). · No agents configured (AGENT_IDS is empty).' });
    return;
  }
  const firedSet = new Set(c.firedIds.map(String));
  const lines = ['👥 <b>Агенти · Agents</b>'];
  const rows = [];
  for (const id of c.allAgentIds) {
    const isOwnerId = Boolean(c.ownerId) && id === c.ownerId;
    const fired = firedSet.has(id);
    const n = Number((await env.VISITS.get('count:agent:' + id)) || 0);
    const card = await env.VISITS.get(cardKey(id));
    const status = isOwnerId ? '👑 owner' : fired ? '🔴 fired' : '🟢 active';
    lines.push(`• <code>${id}</code> ${status} — ${n} visits${card ? ` · 💳 <code>${esc(card)}</code>` : ' · ⚠️ no card'}`);
    if (!isOwnerId) {
      rows.push([fired
        ? { text: `♻️ Rehire ${id}`, callback_data: `ad:rehire:${id}` }
        : { text: `🔥 Fire ${id}`, callback_data: `ad:firereq:${id}` }]);
    }
  }
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n'),
    reply_markup: rows.length ? { inline_keyboard: rows } : undefined });
}

// Collect every stored visit belonging to one agent. Keys are
// `visit:<ts>:<uid>`, so the uid is the segment after the (colon-bearing)
// ISO timestamp — match on the last segment, not a plain `includes`, or an
// agent id that happens to appear inside a timestamp would false-positive.
async function visitsByAgent(env, agentId) {
  const list = await env.VISITS.list({ prefix: 'visit:', limit: 1000 });
  const out = [];
  for (const k of list.keys) {
    if (k.name.slice(k.name.lastIndexOf(':') + 1) !== String(agentId)) continue;
    const rec = await env.VISITS.get(k.name, { type: 'json' });
    if (rec) out.push({ key: k.name, rec });
  }
  return out;
}

// Erase an agent's logged visits and unwind every counter they touched.
// Used to clear owner smoke-test visits so they stop inflating /report.
async function cmdPurgeRequest(env, c, chatId, targetId) {
  const found = await visitsByAgent(env, targetId);
  if (!found.length) {
    await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text: `Немає збережених візитів для <code>${targetId}</code>. · No stored visits for that id.` });
    return;
  }
  const lines = [`⚠️ Delete <b>${found.length}</b> visit(s) by <code>${targetId}</code>?`, ''];
  for (const { rec } of found.slice(0, 10)) {
    lines.push(`• ${esc(rec.ts)} — ${esc(rec.store?.name || 'new store')}`);
  }
  if (found.length > 10) lines.push(`…and ${found.length - 10} more`);
  lines.push('', 'Counters and duplicate-detection stamps are corrected too. This cannot be undone.');
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n'),
    reply_markup: { inline_keyboard: [[
      { text: '🗑️ Confirm delete', callback_data: `ad:purgedo:${targetId}` },
      { text: '❌ Cancel', callback_data: 'ad:fireabort' },
    ]] } });
}

async function cmdPurgeDo(env, c, chatId, targetId) {
  const found = await visitsByAgent(env, targetId);
  if (!found.length) {
    await say(env, chatId, `Немає збережених візитів для <code>${targetId}</code>. · No stored visits for that id.`);
    return;
  }
  // count:total and count:agent:<uid> are only ever bumped together (both sit
  // under finishVisit's `if (!isDup)`), so the agent's own tally is exactly how
  // much of count:total belongs to them — no need to know which visits were dups.
  const agentCount = Number((await env.VISITS.get('count:agent:' + targetId)) || 0);
  // count:bonus is bumped per poster/contact on every visit, dup or not, so it
  // is recomputed straight from the records instead.
  let bonusUnits = 0;
  const touchedStores = new Set();
  for (const { rec } of found) {
    bonusUnits += (rec.poster ? 1 : 0) + (rec.contact ? 1 : 0);
    if (rec.store && rec.store.id) touchedStores.add(rec.store.id);
  }

  for (const { key } of found) await env.VISITS.delete(key);
  await env.VISITS.put('count:agent:' + targetId, '0');
  const total = Number((await env.VISITS.get('count:total')) || 0);
  await env.VISITS.put('count:total', String(Math.max(0, total - agentCount)));
  if (bonusUnits) {
    const bonus = Number((await env.VISITS.get('count:bonus')) || 0);
    await env.VISITS.put('count:bonus', String(Math.max(0, bonus - bonusUnits)));
  }

  // A stale lastvisit: stamp would make the next agent to survey that store look
  // like a repeat visit and silently cost them the base pay — so rebuild each
  // touched store's stamp from whatever visits actually remain.
  for (const storeId of touchedStores) {
    const all = await env.VISITS.list({ prefix: 'visit:', limit: 1000 });
    let newest = null;
    for (const k of all.keys) {
      const r = await env.VISITS.get(k.name, { type: 'json' });
      if (r && r.store && r.store.id === storeId && (!newest || r.ts > newest)) newest = r.ts;
    }
    if (newest) await env.VISITS.put(lastVisitKey(storeId), newest);
    else await env.VISITS.delete(lastVisitKey(storeId));
  }

  await say(env, chatId,
    `🗑️ Видалено · Deleted <b>${found.length}</b> visit(s) by <code>${targetId}</code>.\n` +
    `Лічильники виправлено · Counters corrected: total −${agentCount}` +
    (bonusUnits ? `, bonus −${bonusUnits}` : '') + `, agent tally reset to 0.\n` +
    `Перевірте · Check /report.`);
}

// 🔥 Fire tap → a confirm step (firing is consequential and hard to notice if
// mistapped). The typed /admin fire <id> command skips straight to
// cmdFireDo — typing the exact id out is itself the deliberate act.
async function cmdFireRequest(env, c, chatId, targetId) {
  if (!c.allAgentIds.includes(targetId) || targetId === c.ownerId) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Invalid agent id.' });
    return;
  }
  const n = Number((await env.VISITS.get('count:agent:' + targetId)) || 0);
  const card = await env.VISITS.get(cardKey(targetId));
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
    text: `⚠️ Fire agent <code>${targetId}</code>?\nThey lose bot access immediately.\n` +
      `Final tally: <b>${n} visits</b>${card ? ` · payout card <code>${esc(card)}</code>` : ' · no payout card on file'}.\n` +
      `Settle any unpaid balance before/with this.`,
    reply_markup: { inline_keyboard: [[
      { text: '✅ Confirm fire', callback_data: `ad:firedo:${targetId}` },
      { text: '❌ Cancel', callback_data: 'ad:fireabort' },
    ]] } });
}
async function cmdFireDo(env, c, chatId, targetId) {
  if (!c.allAgentIds.includes(targetId) || targetId === c.ownerId) {
    await say(env, chatId, '⚠️ Invalid agent id.');
    return;
  }
  const fired = new Set((await getFiredIds(env)).map(String));
  fired.add(targetId);
  await setFiredIds(env, [...fired]);
  const n = Number((await env.VISITS.get('count:agent:' + targetId)) || 0);
  await say(env, chatId,
    `🔥 Звільнено · Fired <code>${targetId}</code>. Доступ скасовано негайно · Bot access revoked immediately.\n` +
    `Останній непроплачений підсумок · Final unpaid tally: <b>${n} visits</b> — settle before closing the books.\n` +
    `Заберіть невикористані QR-плакати · Reclaim any unused QR posters.\n` +
    `Можна скасувати будь-коли · Reversible anytime: ♻️ Rehire, or <code>/admin rehire ${targetId}</code>.`);
  // A failed DM (blocked the bot, chat never started) shouldn't hide the
  // owner's confirmation above — the firing itself already took effect.
  try {
    await say(env, targetId,
      '🔒 Ваш доступ до бота польового агента скасовано власником. Дякуємо за роботу. · ' +
      'Your field-agent bot access has been revoked by the owner. Thanks for the work.');
    // Drop /agent from their command list right away; without this it lingers
    // in the Telegram UI (harmlessly — tapping it still hits notAgentMsg) until
    // the next CMD_VER bump. Clear the sync cache too so a later rehire re-adds it.
    await tg(env, 'setMyCommands', { commands: PUBLIC_CMDS, scope: { type: 'chat', chat_id: targetId } });
    await env.VISITS.delete('cmds:' + targetId);
  } catch (e) {}
}
async function cmdRehire(env, c, chatId, targetId) {
  if (!c.allAgentIds.includes(targetId)) {
    await say(env, chatId, '⚠️ Invalid agent id.');
    return;
  }
  const fired = (await getFiredIds(env)).map(String).filter((id) => id !== targetId);
  await setFiredIds(env, fired);
  await say(env, chatId, `♻️ Rehired <code>${targetId}</code>. Access restored.`);
  try {
    await say(env, targetId,
      '✅ Ваш доступ до бота польового агента відновлено. Ласкаво просимо назад! · ' +
      'Your field-agent bot access has been restored. Welcome back!');
    // Force a re-sync so /agent reappears in their command list next message.
    await env.VISITS.delete('cmds:' + targetId);
  } catch (e) {}
}

// Handle an update for the visit subsystem. Returns true if it consumed the update.
async function handleVisit(env, c, msg, ctx) {
  const { userId, chatId, text, from } = ctx;
  const isOwner = c.ownerId && String(userId) === c.ownerId;
  const isAgent = c.agentIds.includes(String(userId));
  const command = text ? (/^\/([a-z]+)(?:@\w+)?/i.exec(text.trim()) || [])[1]?.toLowerCase() : null;

  // Keep each person's Telegram command menu in sync (public menu for everyone;
  // the extended /agent + /admin menu only for the owner & agents).
  if (command) await syncBotCommands(env, userId, isOwner, isAgent);

  // The MENU_AGENT/MENU_ADMIN reply-keyboard buttons (mainMenuMarkupFor) are
  // just another way to say "/agent" or "/admin" — same authorization here
  // either way, so a button only a shopper somehow typed out by hand gets
  // the same notAgentMsg a typed command would.
  if (command === 'agent' || text === MENU_AGENT) {
    if (!(isAgent || isOwner)) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await cmdAgentMenu(env, chatId, isAgent);
    return true;
  }
  if (command === 'admin' || text === MENU_ADMIN) {
    if (!isOwner) { await say(env, chatId, notAgentMsg(userId)); return true; }
    // Subcommands typed directly, e.g. "/admin fire 123456" — the menu button
    // path (ad:agents → ad:firereq: → confirm) is for browsing/one-tap use;
    // typing the exact id out is itself the deliberate act, so this skips
    // the confirm step and fires/rehires immediately.
    const rest = (text || '').replace(/^\/admin(?:@\w+)?\s*/i, '').trim();
    const m = /^(fire|rehire|purge)\s+(\S+)/i.exec(rest);
    if (m) {
      const targetId = m[2].replace(/\D/g, '');
      const sub = m[1].toLowerCase();
      // purge deletes data outright, so it always goes through the confirm
      // step — unlike fire/rehire, which are reversible in one tap.
      if (sub === 'purge') await cmdPurgeRequest(env, c, chatId, targetId);
      else if (sub === 'fire') await cmdFireDo(env, c, chatId, targetId);
      else await cmdRehire(env, c, chatId, targetId);
      return true;
    }
    if (/^agents$/i.test(rest)) { await cmdAdminAgents(env, c, chatId); return true; }
    if (/^(visitors|stats|analytics)$/i.test(rest)) { await cmdAdminVisitors(env, chatId); return true; }
    await cmdAdminMenu(env, chatId);
    return true;
  }

  if (isOwner && (command === 'report' || command === 'visits')) { await ownerReport(env, c, chatId); return true; }
  if (isOwner && command === 'export') { await ownerExport(env, chatId); return true; }

  const session = await getSession(env, userId);

  if (command === 'cancel') return await cmdCancel(env, userId, chatId);
  if (command === 'myvisits') {
    if (!isAgent) return false;
    await cmdMyVisits(env, userId, chatId);
    return true;
  }
  if (command === 'pay') {
    if (!(isAgent || isOwner)) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await cmdPay(env, c, chatId);
    return true;
  }
  if (command === 'card') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    const arg = (text || '').replace(/^\/card(?:@\w+)?\s*/i, '');
    await cmdCard(env, userId, chatId, arg);
    return true;
  }
  if (command === 'job' || command === 'brief') {
    if (!(isAgent || isOwner)) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await cmdJob(env, chatId);
    return true;
  }
  // "/materials c12" → that one store's QR as a photo. Bare "/materials" falls
  // through (return false) to the public text reply, but first arms a
  // short-lived flag so the next message can be just the id — the flow the
  // owner asked for: /materials → c12 → QR.
  if (command === 'materials' || command === 'print' || command === 'flyers') {
    const arg = (text || '').replace(/^\/(materials|print|flyers)(?:@\w+)?\s*/i, '').trim();
    if (arg) { await cmdStoreQr(env, chatId, arg); return true; }
    await env.VISITS.put(qrWaitKey(userId), '1', { expirationTtl: QR_WAIT_TTL });
    return false;
  }
  if (command === 'route') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await cmdRoute(env, userId, chatId);
    return true;
  }

  if (command === 'visit') {
    if (!isAgent) { await say(env, chatId, notAgentMsg(userId)); return true; }
    await cmdVisit(env, userId, chatId, session);
    return true;
  }

  // A bare store id right after /materials. Guarded on !session so it can never
  // swallow an answer to an in-progress /visit questionnaire, and on the armed
  // flag so a stray "c12" at any other time still falls through to /help.
  if (!session && text && !command) {
    let waiting = null;
    try { waiting = await env.VISITS.get(qrWaitKey(userId)); } catch (e) {}
    if (waiting && /^[a-z]{1,3}\d{1,3}$/i.test(text.trim())) {
      await env.VISITS.delete(qrWaitKey(userId));
      await cmdStoreQr(env, chatId, text.trim());
      return true;
    }
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
      await pickStore(env, userId, chatId, session, { id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, cycle: s.cycle });
      return true;
    }
    session.step = 'store_pick';
    session.data.candidates = hits.slice(0, MATCH_LIMIT).map((s) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, cycle: s.cycle }));
    await putSession(env, userId, session);
    const list = session.data.candidates.map((s, i) => `${i + 1}. ${esc(s.name)}${s.address ? ' — ' + esc(s.address) : ''}`).join('\n');
    // searchStores() over-fetches by one precisely to detect this case.
    const more = hits.length > MATCH_LIMIT ? '\n…і ще — уточніть назву. · …and more — try a more specific name.' : '';
    await say(env, chatId, 'Кілька збігів — надішліть номер · Several matches — reply with the number:\n' + list + more,
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
    // A tap on the reply keyboard always matches; this only catches someone
    // typing instead — reprompt rather than silently recording a guess.
    const reprompt = async () => {
      await say(env, chatId, 'Не розпізнав відповідь — оберіть варіант нижче. · Didn’t recognise that — pick an option below.', question.kb);
      return true;
    };
    switch (question.key) {
      case 'pricing': {
        const v = readPricing(val);
        if (v == null) return reprompt();
        session.data.pricing = v;
        break;
      }
      case 'lastdel': session.data.lastDelivery = readLastDelivery(val); break;
      case 'hours': session.data.hours = normalizeHours(val); break;
      case 'size': {
        const v = readSize(val);
        if (v == null) return reprompt();
        session.data.size = v;
        break;
      }
      case 'poster': {
        const v = readYesNo(val);
        if (v == null) return reprompt();
        session.data.poster = v;
        break;
      }
      case 'contact': {
        const v = readYesNo(val);
        if (v == null) return reprompt();
        session.data.contact = v;
        break;
      }
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
  async fetch(request, env, ctx) {
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

    const c = await cfg(env);

    // Inline-keyboard taps (bounty flow) arrive as callback_query, not message.
    // Ack Telegram immediately and finish in the background: dispatchMapPatch
    // (GitHub) inside handleAgentCallback can be slow, and a slow webhook
    // response makes Telegram redeliver the same tap — that double-processed
    // an edit-review approval, fixed in #135. ctx.waitUntil keeps the Worker
    // alive to finish the call after the response is already sent.
    if (update.callback_query) {
      ctx.waitUntil(handleAgentCallback(env, c, update.callback_query).catch(() => {}));
      return ok();
    }

    const msg = update.message || update.edited_message;
    if (!msg) return ok(); // Ignore joins/etc.
    const from = msg.from || {};
    const chatId = msg.chat.id;
    const text = typeof msg.text === 'string' ? msg.text : null;
    const mctx = { userId: from.id, chatId, text, from };

    // Flash-deal subscribe/unsubscribe (Feature 5). Only needs BOT_TOKEN.
    try {
      if (await handleFlashSubStart(env, mctx)) return ok();
      if (await handleStopCommand(env, mctx)) return ok();
    } catch (e) {}

    // Crowdsourced moderation (Feature 6). Only needs BOT_TOKEN.
    try {
      if (await handleEditStart(env, mctx)) return ok();
      if (await handleLeaderboardCommand(env, mctx)) return ok();
    } catch (e) {}

    // Field-agent subsystems (stateful). Only when BOT_TOKEN + VISITS are set.
    if (c.enabled) {
      try {
        if (await handleBountyStart(env, c, mctx)) return ok();
        if (await handleBountyText(env, c, mctx)) return ok();
        const consumed = await handleVisit(env, c, msg, mctx);
        if (consumed) return ok();
      } catch (e) {
        // Never let the field flow break the public bot; ack and move on.
        return ok();
      }
    }

    // General feedback (Feature 7). Only needs BOT_TOKEN + VISITS, not the
    // rest of the field-agent gate — checked after it so an in-progress
    // /visit questionnaire's free-text answers are never mistaken for
    // pending feedback text.
    try {
      if (await handleFeedbackFlow(env, mctx)) return ok();
    } catch (e) {}

    // Public, stateless commands (answered in the webhook response — no token).
    if (!text) return ok();
    // Gated on c.enabled too, not just role: the buttons this unlocks only
    // work through handleVisit, which never runs otherwise.
    const isOwner = c.enabled && Boolean(c.ownerId) && String(from.id) === c.ownerId;
    const isAgent = c.enabled && c.agentIds.includes(String(from.id));
    const reply = replyFor(text, isOwner, isAgent);
    return sendMessage(chatId, reply.text, reply.markup);
  },
};
