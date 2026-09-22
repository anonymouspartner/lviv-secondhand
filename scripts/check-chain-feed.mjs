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
  isItemShowcase,
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

// ── Single-item showcase posts ──────────────────────────────────────────────
// 22 Sep 2026: the post that exposed this. One dress, one branch, its own
// price. It raised the drift alarm, whose text asks for a new anchor — and an
// anchor matching this post would have published 900 грн as today's price at
// all seven HUMANA branches. Reproduced from the text as received rather than
// saved as a fixture: the alarm carries the post text, not the page.
const DRESS = [
  '❤️ Осінній образ, який неможливо не помітити!',
  'Червона сукня з ефектним принтом — жіночна, стильна та з характером 🔥',
  '',
  '📍Любінська, 100, сукня Guess, розмір S, 900 грн.',
  '✨ Нова осіння колекція вже в HUMANA!',
  'Заходьте — можливо, саме ця сукня чекає на вас ❤️',
  'HUMANA — шукайте свою особливу річ! 🛍️',
].join('\n');
{
  const r = readChannelPrices(block(4001, '2026-09-22T06:30:00+00:00', DRESS), '2026-09-22');
  check('a single-item post publishes no price', [r.ok, r.lines], [false, undefined]);
  check('and does not raise drift', r.drift, false);
  check('recognised as a showcase', isItemShowcase(DRESS), true);
}

// 20 Sep 2026: the same class in a different layout — markers spread over
// several lines, and the priced line ("Ціна — 3500 грн") carrying none of its
// own. An earlier version of this guard required a marker on the priced line
// and missed it, so it kept false-alarming; the post is here to keep that
// shape covered. 3500 ₴ is inside the bounds, so it would have shipped.
{
  const tee = [
    '🔥 Palm Angels у HUMANA! 🔥',
    'Стильна футболка Palm Angels — справжня знахідка для тих, хто цінує бренд 🖤',
    '✨ Розмір — oversize',
    '💰 Ціна — 3500 грн',
    '',
    '📍 HUMANA, вул. Шевченка, 31',
  ].join('\n');
  const r = readChannelPrices(block(4007, '2026-09-20T09:00:00+00:00', tee), '2026-09-20');
  check('a showcase with the price on its own line', isItemShowcase(tee), true);
  check('and it neither publishes nor alarms', [r.ok, r.drift], [false, false]);
}

// 20 Sep 2026: the counter-example that keeps the guard honest. A real price
// list that names two branches — markers a showcase would have — but talks
// about the whole stock ("Все по 35 грн") and the whole estate ("Усі інші
// магазини не працюють"). It must stay a price post, not vanish as a showcase.
{
  const openToday = [
    'Сьогодні у нас працюють магазини за адресою:',
    'вул. Шевченка, 31',
    'вул. Кн. Ольги, 5а',
    '',
    '• Все по 35 грн',
    '• Дрібнички — лише по 19 грн',
    '• Ексклюзив — зі знижкою -50%',
    '',
    'Усі інші магазини не працюють.',
  ].join('\n');
  check('a branch-listing price post is not a showcase', isItemShowcase(openToday), false);
  check('and still parses', readChannelPrices(block(4008, '2026-09-20T06:00:00+00:00', openToday), '2026-09-20').lines,
    [{ key: 'exclusive', pct: 50 }]);
}

// The live bug the same guard closes: a showcase item that happens to name a
// category matched the anchors and shipped as a chain-wide price.
{
  const shoes = '📍Любінська, 100, взуття Nike, розмір 42, 900 грн.';
  check('a showcase naming a category still parses in isolation',
    extractPrices(shoes), [{ key: 'shoesTextile', uah: 900 }]);
  const r = readChannelPrices(block(4002, '2026-09-22T06:30:00+00:00', shoes), '2026-09-22');
  check('but is not published as the chain price', [r.ok, r.drift], [false, false]);
}

// The suppression has to stay narrow: a real wording change must still alarm.
{
  const one = block(4003, '2026-09-22T08:00:00+00:00', 'Сьогодні у нас на Любінській, 100 кожна річ по 180 грн!');
  check('one marker alone does not suppress the alarm', readChannelPrices(one, '2026-09-22').drift, true);

  // An address in a price list's footer must not suppress it either — the
  // priced line carries no marker of its own.
  const footer = block(4004, '2026-09-22T08:00:00+00:00',
    'Сьогодні кожна річ по 180 грн!\n📍вул. Любінська, 100 — розмір будь-який');
  check('a footer address does not suppress the alarm', readChannelPrices(footer, '2026-09-22').drift, true);
}

// A showcase post must not blank out the morning's real prices either way.
{
  const html =
    block(4005, '2026-09-22T05:39:00+00:00', 'Білий цінник — 250 грн') +
    block(4006, '2026-09-22T12:00:00+00:00', DRESS);
  const r = readChannelPrices(html, '2026-09-22');
  check('a later showcase falls through to the price post', r.lines, [{ key: 'white', uah: 250 }]);
  check('and keeps the price post’s id', r.postId, 4005);
}

// Marker shapes seen in the channel, and prose that must not read as one.
check('size in Cyrillic ("розмір М")', isItemShowcase('📍Любінська, 100, светр, розмір М, 400 грн'), true);
check('"вул." address form', isItemShowcase('вул. Городоцька 200, пальто, розм. 38, 850 грн'), true);
check('a price list is never a showcase', isItemShowcase('Білий цінник — 250 грн'), false);
check('prose about sizes is not a showcase', isItemShowcase('Усі розміри — білий цінник 250 грн'), false);

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

// ── A price stated above its categories ─────────────────────────────────────
// 18 Sep 2026, real. Line-by-line matching read this as "Ексклюзив −50%" and
// dropped the 56 ₴ headline the post was written to announce — silently, since
// a partial result looks like success and never raises the alarm.
{
  const header = [
    '👀 Є причина сьогодні зазирнути до HUMANA.',
    '',
    'Бо за 56 грн зараз можна забрати:',
    '▫️ одяг із білим цінником',
    '▫️ взуття',
    '▫️ текстиль',
    '',
    'А якщо шукаєте щось маленьке й недороге — дрібний одяг по 30 грн 🛍️',
    '',
    '✨ І ще одна приємність: на «Ексклюзив» діє –50%.',
  ].join('\n');
  check('a header price reaches the categories under it', extractPrices(header), [
    { key: 'white', uah: 56 },
    { key: 'shoesTextile', uah: 56 },
    { key: 'exclusive', pct: 50 },
  ]);
}

// The reach has to end somewhere, or a price from the top of a post would
// colour categories mentioned in passing at the bottom. A blank line ends it —
// the scope the posts use themselves.
check(
  'a blank line ends a header price',
  extractPrices('Все по 250 грн:\n▫️ взуття\n\nЗавітайте по білий цінник!'),
  [{ key: 'shoesTextile', uah: 250 }]
);

// A line that states its own price never inherits, even when that price was
// rejected — it had its say, and the reject is what the bounds are for.
check(
  'an out-of-bounds line does not inherit',
  extractPrices('Все по 250 грн:\n▫️ білий цінник — 250000 грн'),
  []
);
// The store footer with a live header price above it. The digits in the phone
// number still contribute nothing — 250 comes from the header, and under a
// header saying everything is 250 that is the right answer for the line. The
// same footer with no header above it stays empty; that case is below.
check(
  'a phone number contributes no price of its own',
  extractPrices('Все по 250 грн:\n▫️ Білий цінник, тел. (032) 245-50-09'),
  [{ key: 'white', uah: 250 }]
);

// Neither of these names one of the three categories, so there is nothing for
// the header price to attach to — and inventing one would be worse than the
// gap. Both are real posts (19 and 20 Sep 2026).
check(
  '"вибрані товари" is not a category',
  extractPrices('▫️ вибрані товари — за фіксованою ціною 35 грн\n▫️ «Ексклюзив» — –50%'),
  [{ key: 'exclusive', pct: 50 }]
);
check(
  '"Все по 35 грн" is not a category',
  extractPrices('• Все по 35 грн\n• Ексклюзив — зі знижкою -50%'),
  [{ key: 'exclusive', pct: 50 }]
);

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
