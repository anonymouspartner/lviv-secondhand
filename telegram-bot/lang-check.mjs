// Барахолка language rule: listings are in Ukrainian or English, never Russian
// (docs/MARKET.md, rule 8). The first real listing, #aca62f28 "Детские ботинки
// Джек Вулфскин 34 размер", was Russian and went out to the channel and
// Instagram before anyone read it.
//
// Pure and dependency-free so scripts/check-lang.mjs can test it directly. No
// translation and no external language API: two cheap, explainable rules,
// tuned to fail open — a missed Russian listing still meets the owner's ✅/❌,
// while a Ukrainian listing wrongly refused stops a real seller cold.
//
//   a) Any of ы э ъ ё. Ukrainian has none of these letters.
//   b) Cyrillic text with none of і ї є ґ (letters Russian lacks) that contains
//      a word or stem below. Needed because short Russian titles often avoid
//      the rule-(a) letters entirely — "Детские ботинки … размер" does.
//
// Every entry in RU_WORDS must be wrong in Ukrainian. Words that look Russian
// but are also correct Ukrainian are deliberately left out — продам, продаю,
// торг, сумка, хороший, носила — because rule (b) would then refuse a
// Ukrainian seller who happened not to type і/ї/є/ґ.

const RU_LETTERS = /[ыэъё]/i;
const UK_LETTERS = /[іїєґ]/i;
const CYRILLIC = /\p{Script=Cyrillic}/u;

// [form, 'stem' | 'word']. A stem matches at the start of a word; a word must
// match whole. All lowercase; matching is case-insensitive.
const RU_WORDS = [
  ['размер', 'stem'],    // uk: розмір
  ['детск', 'stem'],     // uk: дитячий
  ['состояни', 'stem'],  // uk: стан
  ['новая', 'word'],     // uk: нова
  ['новое', 'word'],     // uk: нове
  ['новые', 'word'],     // uk: нові (also caught by ы)
  ['цена', 'word'],      // uk: ціна
  ['цену', 'word'],
  ['обувь', 'word'],     // uk: взуття
  ['брюки', 'word'],     // uk: штани
  ['платье', 'word'],    // uk: сукня / плаття
  ['мужск', 'stem'],     // uk: чоловічий
  ['женск', 'stem'],     // uk: жіночий
  ['носил', 'word'],     // uk: носив (носила is the same in both — excluded)
  ['почти', 'word'],     // uk: майже
  ['очень', 'word'],     // uk: дуже
  ['отличн', 'stem'],    // uk: відмінний
  ['ботинк', 'stem'],    // uk: черевики
  ['кроссовк', 'stem'],  // uk: кросівки
  ['сапог', 'stem'],     // uk: чоботи
  ['рубашк', 'stem'],    // uk: сорочка
  ['юбк', 'stem'],       // uk: спідниця
  ['одежд', 'stem'],     // uk: одяг
  ['девочк', 'stem'],    // uk: дівчинка
  ['мальчик', 'stem'],   // uk: хлопчик
  ['вещь', 'word'],      // uk: річ
  ['вещи', 'word'],
  ['продается', 'word'], // uk: продається (ё/е spelling, no і)
  ['самовывоз', 'word'], // uk: самовивіз (also caught by ы)
];

// Word boundaries that understand Cyrillic: \b in JS regex only knows [A-Za-z0-9_].
const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
const RU_WORD_RE = new RegExp(
  NOT_LETTER_BEFORE + '(?:' +
  RU_WORDS.map(([w, kind]) => (kind === 'word' ? `${w}${NOT_LETTER_AFTER}` : w)).join('|') +
  ')', 'iu');

// 'ru' if the text reads as Russian by either rule, otherwise 'ok'. Text with
// no Cyrillic at all (English, Latin brand names, sizes, numbers) is 'ok'.
export function detectLang(text) {
  const s = String(text || '');
  if (!CYRILLIC.test(s)) return 'ok';
  if (RU_LETTERS.test(s)) return 'ru';
  if (!UK_LETTERS.test(s) && RU_WORD_RE.test(s)) return 'ru';
  return 'ok';
}

// The seller-written parts of a listing (title, area). Each is checked on its
// own, so a Russian title cannot pass on the strength of a Ukrainian district
// name (whose і would otherwise switch rule (b) off for the whole text).
export function listingLang({ title = '', area = '' } = {}) {
  return detectLang(title) === 'ru' || detectLang(area) === 'ru' ? 'ru' : 'ok';
}

// Shown when a field is refused, then the same question is asked again.
export const RU_REFUSAL =
  'Будь ласка, напишіть оголошення українською (або англійською). Оголошення російською не публікуються.\n' +
  'Please write the listing in Ukrainian or English.';
