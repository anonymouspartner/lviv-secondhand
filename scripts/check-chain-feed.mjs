// Chain-feed parser check — worker/chain-feed.mjs against real captured markup.
//
// This parser's input is someone else's HTML and someone else's copywriting,
// neither of which we control and both of which change without warning. That
// makes it the one piece of this project where a test suite is not optional:
// the two fixtures in scripts/fixtures/ are unmodified captures of real posts,
// so a future rewrite of the parser has to keep reading the posts that actually
// shipped, not the posts we remember.
//
// The rest of the cases encode the failure modes that would be worst in
// production — a stale price presented as today's, a phone number read as a
// price, an em-dash rewrite silently emptying the feed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractPrices,
  kyivDay,
  parseChannelHtml,
  readChannelPrices,
} from '../worker/chain-feed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(HERE, 'fixtures', n), 'utf8');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
  }
}

console.log('chain-feed parser');

// ── The two real posts ──────────────────────────────────────────────────────
// 7 Sep 2026: the ordinary morning post, absolute prices.
{
  const r = readChannelPrices(fixture('channel-price-post.html'), '2026-09-07');
  check('daily price post parses', r.ok && r.lines, [
    { key: 'white', uah: 250 },
    { key: 'shoesTextile', uah: 250 },
    { key: 'exclusive', pct: 50 },
  ]);
  check('daily price post attributes to the text post, not the photo', r.postId, 2002);
}

// 6 Sep 2026: a sale post. Percentages, and one line setting two categories at
// once ("-50% на товар з білим цінником, взуття та текстиль").
{
  const r = readChannelPrices(fixture('channel-sale-post.html'), '2026-09-06');
  check('sale post parses', r.ok && r.lines, [
    { key: 'white', pct: 50 },
    { key: 'shoesTextile', pct: 50 },
    { key: 'exclusive', pct: 30 },
  ]);
}

// ── Staleness: the failure that would actually hurt shoppers ────────────────
// Showing Friday's prices on Sunday is worse than showing none, because the
// number carries no hint that it is old. Only a post made today may count.
{
  const html = fixture('channel-price-post.html');
  const r = readChannelPrices(html, '2026-09-08');
  check('a post from yesterday yields nothing', r.ok, false);
  check('and is not mistaken for a wording change', r.drift, false);
}

// ── Post selection ──────────────────────────────────────────────────────────
{
  const posts = parseChannelHtml(fixture('channel-price-post.html'));
  check('photo-only posts parse but carry no text', posts.map((p) => p.text === ''), [true, false]);
  check('post ids are read from data-post', posts.map((p) => p.postId), [2001, 2002]);
}

// Later post wins: they post two or three times a day and the last word counts.
// Built by hand rather than captured, since it needs two priced posts one day.
const block = (id, at, text) =>
  `<div class="tgme_widget_message" data-post="humanalviv/${id}">` +
  `<div class="tgme_widget_message_text js-message_text">${text}</div>` +
  `<div class="tgme_widget_message_footer"><time datetime="${at}"></time></div></div>`;
{
  const html =
    block(3001, '2026-09-07T05:39:00+00:00', 'Білий цінник — 250 грн') +
    block(3002, '2026-09-07T11:00:00+00:00', 'Білий цінник — 199 грн');
  check('the later post of the day wins', readChannelPrices(html, '2026-09-07').lines, [
    { key: 'white', uah: 199 },
  ]);
}
{
  // ...but a later post that states no price must not blank out the morning's.
  const html =
    block(3001, '2026-09-07T05:39:00+00:00', 'Білий цінник — 250 грн') +
    block(3002, '2026-09-07T17:00:00+00:00', 'Дякуємо за візит! Чекаємо на вас завтра 💛');
  const r = readChannelPrices(html, '2026-09-07');
  check('an evening sign-off falls through to the price post', r.lines, [
    { key: 'white', uah: 250 },
  ]);
  check('and takes the price post’s id', r.postId, 3001);
}

// ── Drift alarm ─────────────────────────────────────────────────────────────
// The distinction the owner alert depends on: nothing to say today, versus a
// price stated in wording we no longer recognise.
{
  const quiet = block(3003, '2026-09-07T08:00:00+00:00', 'Гарного дня, друзі! ☀️');
  check('a day with no price post is not drift', readChannelPrices(quiet, '2026-09-07').drift, false);

  const moved = block(3004, '2026-09-07T08:00:00+00:00', 'Сьогодні кожна річ по 180 грн!');
  const r = readChannelPrices(moved, '2026-09-07');
  check('an unrecognised price line raises drift', [r.ok, r.drift], [false, true]);
}

// ── Value parsing ───────────────────────────────────────────────────────────
check('hryvnia amount', extractPrices('Білий цінник — 250 грн'), [{ key: 'white', uah: 250 }]);
check('the ₴ sign', extractPrices('Білий цінник — 250 ₴'), [{ key: 'white', uah: 250 }]);
check('percentage', extractPrices('«Ексклюзив» — –50%'), [{ key: 'exclusive', pct: 50 }]);

// Dash variants: the channel uses em, en, hyphen and minus interchangeably, and
// a rewrite from one to another must never empty the feed.
for (const [name, dash] of [['em', '—'], ['en', '–'], ['hyphen', '-'], ['minus', '−']]) {
  check(`${name} dash`, extractPrices(`Білий цінник ${dash} 250 грн`), [{ key: 'white', uah: 250 }]);
}

// Cyrillic і vs Latin i — indistinguishable on screen, and the channel mixes them.
check('Latin i in "цiнник"', extractPrices('Бiлий цiнник — 250 грн'), [{ key: 'white', uah: 250 }]);

// Word forms: the noun is declined differently in almost every post.
check(
  'declined form ("білим цінником")',
  extractPrices('-50% на товар з білим цінником, взуття та текстиль'),
  [{ key: 'white', pct: 50 }, { key: 'shoesTextile', pct: 50 }]
);
check('shoes alone', extractPrices('Взуття — 150 грн'), [{ key: 'shoesTextile', uah: 150 }]);
check('textile alone', extractPrices('Текстиль — 100 грн'), [{ key: 'shoesTextile', uah: 100 }]);

// ── Bounds: a misread must not reach the app as a price ─────────────────────
check('an implausible amount is rejected', extractPrices('Білий цінник — 250000 грн'), []);
check('a too-small amount is rejected', extractPrices('Білий цінник — 2 грн'), []);
check('an implausible discount is rejected', extractPrices('«Ексклюзив» — -99%'), []);
check('a trivial discount is rejected', extractPrices('«Ексклюзив» — -1%'), []);

// A category with no number attached is prose, not a price.
check(
  'prose mentioning the categories yields nothing',
  extractPrices('шукаєте ви нову пару взуття чи затишний текстиль для дому — у нас є все!'),
  []
);
// The phone number in every store's footer must never read as a price.
check('a phone number is not a price', extractPrices('Білий цінник, тел. (032) 245-50-09'), []);

// ── Robustness ──────────────────────────────────────────────────────────────
check('empty input', parseChannelHtml(''), []);
check('garbage input does not throw', readChannelPrices('<html>nope</html>', '2026-09-07').ok, false);
check('undefined input does not throw', extractPrices(undefined), []);
check('an unparseable timestamp is dropped', kyivDay('not a date'), null);

// Kyiv is UTC+3 in summer, so a post made at 22:30 UTC belongs to the *next*
// Kyiv day. Getting this backwards would silently hide every late post.
check('late-evening UTC post belongs to the next Kyiv day', kyivDay('2026-09-06T22:30:00+00:00'), '2026-09-07');

if (failed) {
  console.error(`\n${failed} chain-feed check(s) failed`);
  process.exit(1);
}
console.log('\nAll chain-feed checks passed.');
