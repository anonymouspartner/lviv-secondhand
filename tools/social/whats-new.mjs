// The "what's new" carousel: five infographics explaining the барахолка and the
// channel, rendered as one set so they read as a sequence rather than five
// unrelated posts.
//
// WHY A CAROUSEL AND NOT FIVE POSTS
// Five posts is five days of feed, or one day of flooding it. A carousel is one
// post someone swipes through, which is also the only shape in which "here is a
// new feature, here is how to use it, here is what it costs you" holds together.
// .github/workflows/instagram-carousel.yml posts them in the order numbered
// here — Instagram keeps `children` order, so the filenames ARE the sequence.
//
// PORTRAIT ONLY, unlike promo.mjs. Instagram crops every slide of a carousel to
// the aspect ratio of the first, so a set that mixes ratios loses the edges of
// its own cards. 1080×1350 for all five.
//
// NO EMOJI ON THE CARDS. The rendering environment has no colour emoji font, so
// 🏷 and ✅ come out as monochrome fallback glyphs that read as a broken image
// rather than as decoration — and these are committed from wherever they were
// rendered, so what is seen here is what ships. The captions keep their emoji:
// Instagram renders those itself. ✓ and ✕ on the rules card are DejaVu symbols,
// not emoji, and are deliberate.
//
// The shell, the palette and the layout rhythm are promo.mjs's, deliberately:
// these land in the same feed as those posts, and a reader should recognise
// them as the same account before reading a word.
//
// Run: npm run whats-new  →  marketing/instagram/whats-new/*.jpg + caption.txt
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CSS, C } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = resolve(repoRoot, 'marketing/instagram/whats-new');
mkdirSync(outDir, { recursive: true });

const W = 1080, H = 1350;
const SITE = process.env.PROMO_URL || 'www.lvivsecondhand.com';
const CHANNEL = 't.me/Lviv_Secondhand';
const BOT = '@Secondhandlvivbot';
const iconB64 = readFileSync(resolve(repoRoot, 'icon-512.png')).toString('base64');

// Counted, not claimed: the store number on the last card has to be the one the
// map actually shows the day someone taps through.
const STORES = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'))
  .filter((s) => !s.watermark);
const N = STORES.length;

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

const shell = ({ eyebrow, body, accentFoot, foot }) => `
  <div class="card">
    <div class="top">
      <img src="data:image/png;base64,${iconB64}"/>
      <b class="display">Lviv Second Hand</b>
      ${eyebrow ? `<span class="eyebrow body">${eyebrow}</span>` : ''}
    </div>
    <div class="mid">${body}</div>
    <div class="foot">
      <span class="url display">${foot || SITE}</span>
      <span class="cta body">${accentFoot || 'Безкоштовно, без реєстрації'}</span>
    </div>
  </div>`;

const CARDS = [
  {
    name: '1-market',
    eyebrow: 'Нове',
    accentFoot: 'Продавайте безкоштовно',
    body: `
      <h1 class="display">Тепер тут можна<br><em>продавати своє</em></h1>
      <p class="lede body">Барахолка Львова — одяг, взуття та дрібні речі,
        які просто лежать у шафі. Виставляєте через бота, оголошення виходить
        у канал і сюди.</p>
      <p class="en body">Sell your own second-hand things — free.</p>`,
  },
  {
    name: '2-how',
    eyebrow: 'Як це працює',
    accentFoot: BOT,
    foot: 'Команда /sell',
    body: `
      <h1 class="display">Дві хвилини<br><em>від фото до каналу</em></h1>
      <ol class="steps body">
        <li><b class="display">1</b><span>Напишіть боту <em>/sell</em> або тисніть «Продати річ»</span></li>
        <li><b class="display">2</b><span>Фото, що це, ціна. Розмір і район — за бажанням</span></li>
        <li><b class="display">3</b><span>Ми перевіряємо оголошення вручну</span></li>
        <li><b class="display">4</b><span>Воно виходить у канал і в Instagram</span></li>
      </ol>
      <p class="en body">Photo and a price is enough.</p>`,
  },
  {
    name: '3-rules',
    eyebrow: 'Правила',
    accentFoot: 'Домовляєтесь напряму',
    body: `
      <h1 class="display">Гроші —<br><em>лише між вами</em></h1>
      <p class="lede body">Ми не беремо ані комісії, ані передоплати, і не є
        стороною угоди. Зустрічайтеся в людних місцях, перевіряйте річ до оплати.</p>
      <ul class="checks body">
        <li class="yes">Вживане, своє: одяг, взуття, аксесуари</li>
        <li class="yes">Спортінвентар, який донесете в руках</li>
        <li class="no">Меблі, техніка, авто</li>
        <li class="no">Магазини, опт, репліки як оригінал</li>
      </ul>`,
  },
  {
    name: '4-sold',
    eyebrow: 'Після продажу',
    accentFoot: 'Нічого не треба видаляти',
    foot: 'Кнопка «Продано»',
    body: `
      <h1 class="display">Продали —<br><em>один дотик</em></h1>
      <p class="lede body">Тиснете «Продано», і допис зникає з каналу.
        Забули — оголошення саме зникне через 30 днів.</p>
      <p class="lede body">Тому тут немає стіни з речей, проданих три тижні тому.</p>
      <p class="en body">One tap, and it is gone from the feed.</p>`,
  },
  {
    name: '5-channel',
    eyebrow: 'І ще',
    accentFoot: 'Посилання там працюють',
    foot: CHANNEL,
    body: `
      <h1 class="display">Щовечора:<br><em>хто завозить завтра</em></h1>
      <p class="lede body">У Telegram-каналі — список магазинів із завозом на завтра
        й маршрут між ними. Плюс уся барахолка.</p>
      <p class="lede body">${N} ${plural(N, 'секонд-хенд', 'секонд-хенди', 'секонд-хендів')}
        Львова на карті — там само, де й були.</p>
      <p class="en body">Tomorrow's restocks, every evening.</p>`,
  },
];

const css = `
  ${CSS}
  body{width:${W}px;height:${H}px;background:${C.ink};}
  .card{width:${W}px;height:${H}px;background:
      radial-gradient(120% 90% at 12% 0%, ${C.green} 0%, ${C.ink} 62%);
    color:#fff;padding:80px 64px;display:flex;flex-direction:column;}
  .top{display:flex;align-items:center;gap:16px;}
  .top img{width:64px;height:64px;border-radius:16px;}
  .top b{font-size:34px;letter-spacing:.02em;}
  .eyebrow{margin-left:auto;font-size:22px;color:${C.acid};border:1px solid rgba(255,210,63,.45);
    padding:7px 14px;border-radius:999px;letter-spacing:.06em;text-transform:uppercase;}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;}
  /* h1.display, not h1 — brand.mjs's .display sets line-height:.94 and a class
     outranks an element selector, so a bare h1 rule here is silently ignored.
     Uppercase Cyrillic diacritics (Й, Ї, Є) need more leading than that. */
  h1.display{font-size:88px;line-height:1.14;letter-spacing:.004em;}
  h1 em{font-style:normal;color:${C.acid};}
  .lede{font-size:31px;line-height:1.42;color:#dff0e6;}
  .en{font-size:24px;color:#8fb9a1;letter-spacing:.01em;}
  .steps{list-style:none;display:flex;flex-direction:column;gap:16px;}
  .steps li{display:flex;align-items:center;gap:22px;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:18px 24px;}
  .steps li b{font-size:38px;color:${C.acid};line-height:1;flex:none;width:42px;}
  .steps li span{font-size:28px;line-height:1.3;color:#dff0e6;}
  .steps li em{font-style:normal;color:#fff;}
  .checks{list-style:none;display:flex;flex-direction:column;gap:14px;font-size:29px;color:#dff0e6;}
  .checks li{display:flex;align-items:center;gap:16px;}
  .checks li:before{font-size:26px;flex:none;width:34px;}
  .checks li.yes:before{content:'✓';color:${C.acid};}
  .checks li.no:before{content:'✕';color:#e88;}
  .foot{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
    border-top:1px solid rgba(255,255,255,.16);padding-top:28px;}
  .url{font-size:40px;color:${C.acid};letter-spacing:.01em;}
  .cta{font-size:24px;color:#bfe6cf;text-align:right;}
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const card of CARDS) {
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>${css}</style></head>
<body>${shell(card)}</body></html>`;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });

  // The screenshot crops silently, so a card that overflows produces a
  // plausible image with its last line missing. Same assertion as
  // store-feature.mjs, and the same 0.2em inflation: Oswald's uppercase
  // Cyrillic paints above the em box.
  const bad = await page.evaluate(() => {
    const cardEl = document.querySelector('.card');
    const box = cardEl.getBoundingClientRect();
    const out = [];
    if (cardEl.scrollHeight > cardEl.clientHeight + 1) {
      out.push(`content is ${cardEl.scrollHeight - cardEl.clientHeight}px taller than the card`);
    }
    for (const el of document.querySelectorAll('h1, .lede, .en, .steps li, .checks li, .url, .cta, .eyebrow')) {
      const r = el.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el).fontSize) * 0.2;
      const label = (el.textContent || '').trim().slice(0, 34);
      if (r.top - pad < box.top || r.bottom + pad > box.bottom) out.push(`"${label}" reaches the card's top/bottom edge`);
      if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`"${label}" reaches the left/right edge`);
    }
    return out;
  });
  if (bad.length) {
    await browser.close();
    throw new Error(`layout does not fit for ${card.name}:\n  - ` + bad.join('\n  - '));
  }

  // JPEG only — Instagram's publishing API rejects PNG with a generic error.
  writeFileSync(resolve(outDir, `${card.name}.jpg`), await page.locator('.card').screenshot({ type: 'jpeg', quality: 92 }));
  await page.close();
}
await browser.close();

// One caption for the whole carousel. Instagram captions are not clickable, so
// both handles are written out as text someone can retype.
const caption = [
  'Тепер на карті секонд-хендів Львова можна продавати своє 🏷',
  '',
  `Барахолка: одяг, взуття та дрібні речі. Виставляєте через бота ${BOT} — команда /sell або кнопка «Продати річ». Фото, що це, ціна; розмір і район за бажанням. Ми перевіряємо кожне оголошення вручну, і воно виходить у канал та сюди.`,
  '',
  'Гроші — лише між вами: ми не беремо ані комісії, ані передоплати і не є стороною угоди. Зустрічайтеся в людних місцях і перевіряйте річ до оплати.',
  '',
  'Продали — тиснете «✅ Продано», і допис зникає. Забули — зникне саме через 30 днів.',
  '',
  `Уся барахолка і щовечірній список «хто завозить завтра» — у каналі ${CHANNEL}`,
  `Карта: ${SITE}`,
  '',
  '#барахолка #секондхендльвів #львів #секондхенд #lviv #шопінгльвів #thrifting #вінтаж #ukraine',
].join('\n');
writeFileSync(resolve(outDir, 'caption.txt'), caption + '\n');

console.log(`Wrote ${CARDS.length} cards + caption.txt to marketing/instagram/whats-new/ (${N} stores).`);
