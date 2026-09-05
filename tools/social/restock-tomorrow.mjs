// Composes the daily "who restocks tomorrow" line for the Telegram channel.
// Prints the message on stdout, or NOTHING when no store restocks tomorrow —
// which the workflow reads as "post nothing today". A channel that says
// "nobody restocks tomorrow" every Saturday gets muted, and a muted channel is
// worse than a small one.
//
// WHY TOMORROW AND NOT TODAY
// The bot already answers "today" on demand (/today). The thing a broadcast can
// do that a command cannot is arrive before you need it: a shop's restock is
// worth knowing the evening before, while you can still plan to be there when
// it opens. So this is the one post that is genuinely time-critical, and the
// only reason it is worth a daily slot at all.
//
// WHAT COUNTS AS "RESTOCKING TOMORROW"
// The same two forward-looking signals the bot's todayText() reads, and no
// others:
//
//   restockDay      — a fixed weekly day.
//   restockDates    — a published calendar (HUMANA states its drop dates).
//
// Deliberately NOT included:
//   restock_date  — that is when a store LAST restocked, so it can never name a
//                   future day. The bot compares it to today for exactly that
//                   reason; comparing it to tomorrow would always be false.
//   cycle         — a 7-day cycle says a restock is DUE, not that it happens.
//                   Announcing "they restock tomorrow" from an average would
//                   send people to a closed rail, and the map's whole claim is
//                   that it does not guess.
//   dailyDrop     — restocks every day, so "tomorrow" is not news. (No store
//                   currently carries both dailyDrop and a fixed day, so this
//                   costs nothing today and stays correct if one ever does.)
//
// Inputs (all optional):
//   RESTOCK_OFFSET_DAYS   day offset, default 1 (tomorrow). For testing.
//   PROMO_URL             site origin used in links.
//
// Run: node restock-tomorrow.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SITE = process.env.PROMO_URL || 'https://www.lvivsecondhand.com';
const OFFSET = Number(process.env.RESTOCK_OFFSET_DAYS ?? 1);

// Lviv time, not the runner's UTC. Kyiv runs UTC+2/+3, so for a few hours every
// night Kyiv has already crossed into a new calendar day while UTC has not — a
// naive toISOString() would name the wrong day during exactly the evening
// window this post goes out in. Same helpers, same reason, as the bot's
// isoDay()/kyivWeekday().
const at = new Date(Date.now() + OFFSET * 86400000);
const KYIV = { timeZone: 'Europe/Kyiv' };
const isoDate = new Intl.DateTimeFormat('en-CA', KYIV).format(at);
const weekday = new Intl.DateTimeFormat('en-US', { ...KYIV, weekday: 'short' })
  .format(at).toLowerCase().slice(0, 3);

const DAY_UK = {
  mon: 'понеділок', tue: 'вівторок', wed: 'середа', thu: 'четвер',
  fri: 'п’ятниця', sat: 'субота', sun: 'неділя',
};

const stores = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'))
  .filter((s) => !s.watermark && !s.dailyDrop);

// A published date beats a weekday: a chain that states its drop dates outright
// is the most reliable signal there is, and for HUMANA it lands roughly every
// five weeks — so on the rare day it fires it leads, rather than being buried
// among the weekly regulars.
const dated = stores.filter((s) => Array.isArray(s.restockDates) && s.restockDates.includes(isoDate));
const datedIds = new Set(dated.map((s) => s.id));
const weekly = stores.filter((s) => s.restockDay === weekday && !datedIds.has(s.id));

if (!dated.length && !weekly.length) {
  process.exit(0); // Nothing to say. Say nothing.
}

// The map filters to exactly these shops. One tappable link beats one link per
// store: a channel post is read on a phone, and fifteen links is a wall.
const routeUrl = `${SITE}/?route=${[...dated, ...weekly].map((s) => s.id).join(',')}`;

// Long enough to be complete on a normal day (the busiest fixed day has 14),
// capped so an unusual day cannot turn the post into a scroll.
const MAX = 15;

// Most names already carry their branch ("EconomClass — Horska 5A"), and a
// street number is what makes them distinguishable. The few that do not are
// bare ("Second Hand", "Євро секонд хенд") and are useless in a list of
// fifteen, so those get their address appended. A digit in the name is the
// test, because that is exactly what a located name has and a generic one
// lacks. The "вул." prefix is dropped as noise once every line has one.
const shortAddr = (a) => String(a || '').replace(/^(вул\.|вулиця|просп\.|проспект)\s+/i, '');
const line = (s) => (/\d/.test(s.name) || !s.address)
  ? `• ${s.name}`
  : `• ${s.name} — ${shortAddr(s.address)}`;

const out = [];
const total = dated.length + weekly.length;
out.push(`🗓 Завтра завозять — ${DAY_UK[weekday]}`, '');

if (dated.length) {
  out.push('📅 За опублікованим календарем:', ...dated.map(line), '');
}
if (weekly.length) {
  if (dated.length) out.push('Щотижневий день завозу:');
  const shown = weekly.slice(0, Math.max(0, MAX - dated.length));
  out.push(...shown.map(line));
  const rest = weekly.length - shown.length;
  if (rest > 0) out.push(`… і ще ${rest}`);
  out.push('');
}

out.push(
  `${total === 1 ? 'Магазин' : 'Усі'} на карті → ${routeUrl}`,
  '',
  'У день завозу вибір найбільший — далі ціна падає, але й розбирають.',
);

process.stdout.write(out.join('\n'));
