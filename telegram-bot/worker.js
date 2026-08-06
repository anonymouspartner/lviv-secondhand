// ─────────────────────────────────────────────────────────────────────────────
// Lviv Second Hand — Telegram bot (Cloudflare Worker, webhook-based)
//
// Commands:
//   /start, /help — intro + command list
//   /today        — stores getting fresh stock TODAY (fixed weekly restock day)
//   /cheap        — best by-weight deals right now (late in the weekly cycle)
//
// Data source: the app's own curated dataset, extracted from index.html at build
// time into stores.gen.js (single source of truth — see build-data.mjs). The bot
// only reasons about GLOBAL facts: the by-weight stores with a fixed weekly
// restock day. Per-user delivery dates live in each visitor's browser and are
// deliberately never on the server, so the bot never guesses about them.
//
// Replies use Telegram's "answer in the webhook response" pattern: we return a
// single sendMessage call as the HTTP response body, so no bot token is needed at
// runtime. The only secret is WEBHOOK_SECRET, which authenticates that inbound
// requests really come from Telegram.
// ─────────────────────────────────────────────────────────────────────────────
import { STORES } from './stores.gen.js';

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
    '/help — this message · ця довідка',
    '',
    `🗺️ Full map, hours &amp; price tracker: ${APP_URL}`,
  ].join('\n');
}

function todayText() {
  const wd = kyivWeekday();
  const todays = STORES.filter((s) => s.restockDay === wd);
  if (!todays.length) {
    return [
      `📦 <b>No scheduled restocks today (${DAY_NAMES[wd]}).</b>`,
      'The tracked by-weight stores restock Mon–Fri.',
      '',
      'Try /cheap for the best by-weight deals right now, or open the full map:',
      APP_URL,
    ].join('\n');
  }
  const blocks = todays.map((s) => storeBlock(s, '🆕 Fresh stock today')).join('\n\n');
  return [
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
  return [
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

// Map a command to its reply text. Returns null for anything we don't handle.
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
    default:
      return 'Unknown command. Send /help to see what I can do.';
  }
}

function sendMessage(chatId, text) {
  return new Response(
    JSON.stringify({ method: 'sendMessage', chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

const ok = (body = 'ok') => new Response(body, { status: 200 });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    const msg = update.message || update.edited_message;
    const text = msg && typeof msg.text === 'string' ? msg.text : null;
    if (!msg || !text) return ok(); // Ignore non-text updates (joins, photos, callbacks…).

    return sendMessage(msg.chat.id, replyFor(text));
  },
};
