// Chain price feed — parses a public Telegram channel preview page into today's
// prices, so the app can show what a chain actually charges instead of only the
// cycle estimate it infers.
//
// Why this exists. HUMANA's seven Lviv stores are `pricing: 'item'`, and the app
// has no price data for them at all — renderStore deliberately shows no price box
// (see index.html, "There is no price data for these stores"). But the chain
// publishes exactly that data every morning on its own channel:
//
//     🏷️ Білий цінник — 250 грн
//     👟 Взуття та текстиль — 250 грн
//     💎 «Ексклюзив» — –50%
//
// That is today's real price at every branch. This module turns those lines into
// { key, uah | pct } facts. The app renders its own EN/UA labels from the keys and
// links back to the source post — it never reprints the channel's copy or images.
//
// Everything here is pure: no Worker APIs, no network, no clock. `today` is passed
// in. That is what lets scripts/check-chain-feed.mjs drive it under plain Node
// against saved fixtures, which matters more than usual for a parser whose input
// is someone else's HTML and wording.

// Telegram serves the public preview at https://t.me/s/<channel>.
export const CHANNEL = 'humanalviv';
export const CHANNEL_URL = `https://t.me/s/${CHANNEL}`;

// Bounds. A price outside these is a parse error, not a bargain: they exist so a
// misread — a phone number, a year, a subscriber count — can never reach the app
// as a price.
const MIN_UAH = 10;
const MAX_UAH = 5000;
const MIN_PCT = 5;
const MAX_PCT = 90;

// Cyrillic і (U+0456) and Latin i are indistinguishable on screen and the channel
// mixes them. Fold both to one character on the text *and* on the anchors below,
// so a stray Latin i in a post can never silently stop matching.
function foldI(s) {
  return String(s).replace(/[іi]/g, 'i');
}

// Categories, in the order the app renders them. Anchors match the category noun
// only — the channel rewrites its wording constantly ("Білий цінник — 250 грн"
// one day, "-50% на товар з білим цінником" the next), and the noun is the only
// stable part across those rewrites.
//
// The `u` flag and \p{L} are load-bearing: JavaScript's \w and \b are ASCII-only,
// so \w* after a Cyrillic stem matches nothing and \b next to Cyrillic is not a
// word boundary at all. Every pattern here that touches Ukrainian needs both.
const CATEGORIES = [
  { key: 'white', src: 'біл\\p{L}*\\s+цінник\\p{L}*|цінник\\p{L}*\\s+біл\\p{L}*' },
  { key: 'shoesTextile', src: 'взутт\\p{L}*|текстил\\p{L}*' },
  { key: 'exclusive', src: 'ексклюзив\\p{L}*' },
].map((c) => ({ key: c.key, re: new RegExp(foldI(c.src), 'u') }));

// Normalise away every difference that is presentation rather than content: dash
// variants (—, –, − all appear in the same week), non-breaking and zero-width
// spaces (the channel prefixes lines with U+200B), the guillemets around
// «Ексклюзив», and case. Emoji are left alone — they sit outside the anchors and
// the values, so they cost nothing, and stripping them by codepoint range is a
// good way to accidentally eat a digit.
function normalize(s) {
  return foldI(
    String(s)
      .normalize('NFKC')
      .replace(/[‐-―−⁃]/g, '-')
      .replace(/[   ​‎‏]/g, ' ')
      .replace(/[«»„“”"'‘’]/g, ' ')
      .toLowerCase()
  ).replace(/[ \t]+/g, ' ');
}

const RE_UAH = /(\d{1,4})\s*(?:грн|₴|uah)(?!\p{L})/u;
const RE_PCT = /(\d{1,3})\s*%/;
const RE_PRICED = /\d\s*(?:грн|₴|%)/;

// A value on one line. Preferring the hryvnia amount when a line carries both is
// arbitrary but has to be decided somewhere: an absolute price is the more useful
// of the two, and a line stating both ("все по 24 грн (-50%)") means the same
// thing either way.
function valueOf(line) {
  const uah = line.match(RE_UAH);
  if (uah) {
    const n = Number(uah[1]);
    return n >= MIN_UAH && n <= MAX_UAH ? { uah: n } : null;
  }
  const pct = line.match(RE_PCT);
  if (pct) {
    const n = Number(pct[1]);
    return n >= MIN_PCT && n <= MAX_PCT ? { pct: n } : null;
  }
  return null;
}

// True when a line looks like it was *meant* to state a price, whatever we made
// of it. Drives the drift alarm: a post full of "грн" that yields nothing means
// the wording moved and the owner needs to know — a different and far more
// urgent condition than a day with no price post at all.
function looksPriced(line) {
  return RE_PRICED.test(line);
}

/**
 * Pull the price facts out of one post's text.
 * Returns [] for a post that states no price — the overwhelmingly common case,
 * since most posts are prose.
 */
export function extractPrices(text) {
  const lines = normalize(text).split(/\n+/);
  const found = new Map();
  for (const line of lines) {
    const value = valueOf(line);
    if (!value) continue;
    // One line can carry several categories: "-50% на товар з білим цінником,
    // взуття та текстиль" sets two at once.
    for (const cat of CATEGORIES) {
      // First statement wins. The headline is at the top of a post; anything
      // further down is a restatement or a footnote.
      if (cat.re.test(line) && !found.has(cat.key)) found.set(cat.key, { key: cat.key, ...value });
    }
  }
  // Canonical order, not the order the post happened to use, so the app's
  // rendering is stable across rewrites.
  return CATEGORIES.filter((c) => found.has(c.key)).map((c) => found.get(c.key));
}

// ── HTML → posts ────────────────────────────────────────────────────────────
// The preview page is one <div data-post="channel/<id>"> per message, and both
// the message text and its footer (carrying <time datetime>) fall between that
// attribute and the next one — so slicing on it is enough. No DOM parser exists
// in a Worker, and pulling one in for three fields is not worth it.

// An out-of-range codepoint throws RangeError, and one malformed entity must not
// take down the whole day's parse — leave it as written instead.
function codePoint(raw, n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return raw;
  }
}

function decodeEntities(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // Numeric entities first, and generically: Telegram escapes assorted ASCII
    // punctuation this way (&#33; for "!"), not just the few named ones.
    .replace(/&#(\d+);/g, (m, n) => codePoint(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(m, parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // last: an entity it produces must not be re-decoded
}

/**
 * Every post on the page, in document order.
 * → [{ postId:number, postedAt:string (ISO), text:string }]
 */
export function parseChannelHtml(html) {
  const src = String(html || '');
  const marks = [];
  const re = /data-post="[^"/]+\/(\d+)"/g;
  let m;
  while ((m = re.exec(src))) marks.push({ id: Number(m[1]), at: m.index });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const slice = src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length);
    const time = slice.match(/<time[^>]*\bdatetime="([^"]+)"/);
    if (!time) continue; // no footer in this slice — not a complete message block
    const body = slice.match(
      /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>\s*<div class="tgme_widget_message_footer/
    );
    out.push({
      postId: marks[i].id,
      postedAt: time[1],
      text: body ? decodeEntities(body[1]).trim() : '', // photo-only posts have none
    });
  }
  return out;
}

/** 'YYYY-MM-DD' in Europe/Kyiv for an ISO timestamp, or null if unparseable. */
export function kyivDay(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);
}

/**
 * The whole pipeline: channel HTML + today's Kyiv date → today's prices.
 *
 * Fails closed, deliberately and in every direction. Only a post made *today*
 * counts — never "the latest post", or one quiet weekend would leave Friday's
 * prices on the map reading as current. A post that yields no recognised line is
 * not a partial result, it is nothing.
 *
 * → { ok:true, postId, day, lines, raw }
 * → { ok:false, drift:boolean, raw:string }   drift = today's post stated a price
 *                                             we failed to read (alarm-worthy)
 */
export function readChannelPrices(html, today) {
  const todays = parseChannelHtml(html).filter((p) => p.text && kyivDay(p.postedAt) === today);
  // Newest first: they post two or three times a day, and the last word on
  // today's prices is the one that counts. Falling through to an earlier post
  // covers the common evening sign-off that states no price at all.
  todays.sort((a, b) => b.postId - a.postId);
  for (const p of todays) {
    const lines = extractPrices(p.text);
    if (lines.length) return { ok: true, postId: p.postId, day: today, lines, raw: p.text };
  }
  const suspect = todays.find((p) => normalize(p.text).split(/\n+/).some(looksPriced));
  return { ok: false, drift: !!suspect, raw: suspect ? suspect.text : '' };
}

/** Canonical public link to a post, for the "source" line in the app. */
export function postUrl(postId) {
  return `https://t.me/${CHANNEL}/${postId}`;
}
