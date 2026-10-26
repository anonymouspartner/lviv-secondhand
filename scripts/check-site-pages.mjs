// Site information pages — what LiqPay's merchant review (and any customer)
// must be able to read on the site as served, without JavaScript.
//
// LiqPay rejected the shop twice for details that existed only inside the
// offer or only after the app's JavaScript ran. This keeps them where a
// reviewer reads them:
//   - one footer, identical on every information page and on the home page,
//     in static HTML, carrying the seller details exactly as offer.html §12
//     states them (which is also what the LiqPay cabinet holds);
//   - «Про сервіс» and the links on the home page outside any <script>;
//   - services.html listing every price offer.html §4 charges;
//   - the new pages in the sitemap, their images present, no Stripe, no phone.
import { readFileSync, existsSync } from 'node:fs';

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const read = (f) => readFileSync(f, 'utf8');
const stripScripts = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '');

const PAGES = ['index.html', 'offer.html', 'privacy.html', 'services.html', 'contacts.html', 'returns.html'];
const SELLER = {
  name: 'ФОП Хейген Тімоті Рендалл',
  taxId: '3537413536',
  address: '79008, Львівська обл., м. Львів, вул. Театральна, буд. 7, кв. 6',
  email: 'hello@lvivsecondhand.com',
  telegram: '@Secondhandlvivbot',
};

// The seller details in the footer are the ones offer.html §12 states.
const offer = read('offer.html');
const s12 = (offer.match(/<h2>12\. Реквізити Виконавця<\/h2>([\s\S]*?)<\/dl>/) || [])[1] || '';
for (const [k, v] of Object.entries(SELLER)) check(s12.includes(v), `offer.html §12 no longer states the ${k} "${v}" — update SELLER here and the footer on every page together`);

const footerOf = (html) => (html.match(/<!-- SITE FOOTER[\s\S]*?<!-- \/SITE FOOTER -->/) || [])[0] || '';
const canonical = footerOf(read('offer.html'));
check(canonical, 'offer.html has no SITE FOOTER block');
for (const v of Object.values(SELLER)) check(canonical.includes(v), `the footer is missing "${v}"`);
for (const href of ['services.html', 'contacts.html', 'returns.html', 'offer.html', 'privacy.html']) {
  check(canonical.includes(`href="${href}"`), `the footer does not link ${href}`);
}
for (const logo of ['liqpay-logo.svg', 'visa-logo.svg', 'mastercard-logo.svg']) {
  check(canonical.includes(`src="${logo}"`), `the footer does not show ${logo}`);
  check(existsSync(logo), `${logo} is missing`);
}
check(canonical.includes('Юридична адреса: ' + SELLER.address), 'the footer does not label the legal address');

for (const f of PAGES) {
  check(existsSync(f), `${f} is missing`);
  if (!existsSync(f)) continue;
  const html = read(f);
  const stat = stripScripts(html);
  const foot = footerOf(stat);
  check(foot, `${f} has no SITE FOOTER in its static HTML`);
  check(!foot || foot === canonical, `${f}'s footer differs from offer.html's — the copies must be identical`);
  check(!/buy\.stripe\.com|checkout\.stripe\.com|js\.stripe\.com/.test(html), `${f} links to a Stripe payment page`);
  check(!/\+380|tel:/.test(foot), `${f}'s footer shows a phone number, which the owner has not published`);
  for (const m of html.matchAll(/src="(img\/[^"]+)"/g)) check(existsSync(m[1]), `${f} shows ${m[1]}, which does not exist`);
}

// The home page as served (scripts removed) explains the service and links out.
const home = stripScripts(read('index.html'));
check(/<h2>Про сервіс<\/h2>/.test(home), 'index.html has no static «Про сервіс» section');
for (const href of ['services.html', 'contacts.html', 'returns.html', 'offer.html', 'privacy.html']) {
  const about = (home.match(/<section class="about-static"[\s\S]*?<\/section>/) || [''])[0];
  check(about.includes(`href="${href}"`), `the home page's «Про сервіс» does not link ${href}`);
}
check(home.indexOf('id="about"') > home.indexOf('<!-- /#app-shell -->'), '«Про сервіс» must sit outside the app shell, or it is hidden behind the map');

// Every price the offer charges is on the services page, each with a way to pay.
const s4 = (offer.match(/<h2>4\. Ціни<\/h2>([\s\S]*?)<h2>5\./) || [])[1] || '';
const prices = new Set([...s4.matchAll(/₴([\d\s]+)/g)].map((m) => m[1].trim()));
check(prices.size >= 15, `could not read the prices in offer.html §4 (found ${prices.size})`);
const services = read('services.html');
for (const p of prices) check(services.includes('₴' + p), `services.html does not show ₴${p}, which offer.html §4 charges`);
for (const name of ['Verified+', 'Featured', 'Spotlight', 'Спалах-знижка', 'Пропозиція тижня', 'Розміщення плаката', 'Спонсороване сповіщення']) {
  check(services.includes(`<h3>${name}</h3>`), `services.html has no section for ${name}`);
}
check((services.match(/class="pay" href="\.\/\?advertise"/g) || []).length >= 7, 'services.html is missing «Оплатити» buttons into the checkout');

// Returns restates offer §8 and points at it.
const returns = read('returns.html');
check(returns.includes('href="offer.html#refunds"') && offer.includes('id="refunds"'), 'returns.html must link offer.html#refunds, and offer §8 must carry that id');
check(/обмін не застосовується/.test(returns), 'returns.html must say exchange does not apply to advertising services');

// Contacts carries the seller details and a reply time.
const contacts = read('contacts.html');
for (const v of Object.values(SELLER)) check(contacts.includes(v), `contacts.html is missing "${v}"`);
check(/Час відповіді/.test(contacts), 'contacts.html must state the reply time');

const sitemap = read('sitemap.xml');
for (const f of ['services.html', 'contacts.html', 'returns.html', 'offer.html', 'privacy.html']) {
  check(sitemap.includes(`https://www.lvivsecondhand.com/${f}`), `sitemap.xml does not list ${f}`);
}

if (failures.length) {
  console.error('Site pages check FAILED:\n' + failures.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
console.log(`Site pages OK — one footer on ${PAGES.length} pages matching offer §12, «Про сервіс» in the static home page, ${prices.size} offer prices on services.html, sitemap complete.`);
