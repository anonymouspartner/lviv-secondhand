# 🧥 Lviv Second Hand Store Finder

A PWA (Progressive Web App) for finding and tracking second-hand clothing stores in Lviv, Ukraine.

**🔗 Live app:** https://www.lvivsecondhand.com/

> **© 2026 — All rights reserved. Proprietary, _not_ open-source.** You may use the hosted app in your browser for personal use. Copying, redistributing, or cloning the code, or reusing the curated store dataset, is prohibited without written permission — see [LICENSE](LICENSE).

No app store, no install required to use it in a browser — but adding it to your home screen gives you a fullscreen, app-like experience with one tap.

---

## 📲 Install on Android

1. Open **Chrome** on your phone
2. Go to https://www.lvivsecondhand.com/
3. Tap the **⋮** menu (top-right)
4. Tap **"Add to Home Screen"**
5. Tap **Add**
6. The app appears on your home screen and opens fullscreen 🎉

## 🍏 Install on iPhone

1. Open **Safari** (must be Safari, not Chrome)
2. Go to https://www.lvivsecondhand.com/
3. Tap the **Share** button (box with arrow, bottom of screen)
4. Tap **"Add to Home Screen"**
5. Tap **Add**

> ⚠️ On iOS, the Add to Home Screen option only works in Safari — Chrome on iPhone doesn't support PWA installs.

---

## ✨ Features

- 🗺️ **Map** of all second-hand stores in Lviv
- 📍 **Show my location** — see yourself on the map with a live GPS toggle
- ⏱️ **Inventory cycle tracker** — counts days since last delivery, estimates current discounts
- ⚖️ Supports both **by-KG** and **itemized** stores
- 🌐 **EN / UA** language toggle
- ✅ Mark stores as **visited**
- 🔔 **Restock alerts** — follow a store and get a push notification the morning it restocks (opt-in; installed PWA required on iOS 16.4+)
- ➕ **Add**, ✏️ **edit**, and 🗑️ **remove/hide** stores
- 🤝 **Share your map** & **contribute** additions/edits to everyone
- 🔗 **Link to a store** — copy a direct `?store=<id>` link that opens straight on that store
- 💬 **Telegram bot** — [@Secondhandlvivbot](https://t.me/Secondhandlvivbot): `/today` for stores restocking today, `/cheap` for the best by-weight deals
- 📣 **Store promotions** — a shop owner can promote their own store from inside the app; every paid placement is labelled
- 📶 **Works offline** — installable PWA with on-device caching, no CDN dependency

## 🤝 Sharing & Contributing

Stores you add or edit are normally saved only on your own device. The **🤝 button** (top-right) lets you share them:

- **🔗 Copy share link** — sends your added & edited stores to anyone. When they open the link, your stores merge onto their map (duplicates are skipped automatically). You can also **download a file** or **copy a short code** instead.
- **📥 Import from others** — paste a link/code someone sent you, or load their `.json` file, to add their stores to yours.
- **🌍 Contribute to the official map** — opens a pre-filled [GitHub issue](https://github.com/anonymouspartner/lviv-secondhand/issues) with your additions and corrections. Once a maintainer merges it, your changes ship in the map everyone downloads. (A free GitHub account is needed to post.)

> Because the app is a static site with no server, peer sharing is instant and private, while contributions to the *official* map go through GitHub so a maintainer can review and merge them.

### For maintainers

Contributions arrive as GitHub issues labelled `map-contribution`. Each issue lists the added/edited/removed stores in plain text plus a collapsible `json` block. To merge:

- **`custom`** — copy each object into the `STORES` array in `index.html` (assign a stable `id`, fill in `hours`).
- **`overrides`** — fold each into the matching store's fields.
- **`removed`** — a list of built-in store `id`s the contributor reports as non-existent/wrong; delete those entries from the `STORES` array.

## 📣 Store promotions (advertising)

Shop owners can promote their own store without contacting anyone. Open the store in the app → **📣 Own this store? Promote it** → pick a plan and pay in ₴ (Stripe). Everything is priced and displayed in Ukrainian by default.

| Tier | Monthly | Annual | One-off 7 / 30 days |
| --- | --- | --- | --- |
| **Verified+** | ₴250 | ₴2,500 | ₴100 / ₴250 |
| **Featured** | ₴600 | ₴6,000 | ₴200 / ₴600 |
| **Spotlight** | ₴1,200 | ₴12,000 | ₴400 / ₴1,200 |

**What each tier changes on screen** — the app enforces this, so paying more visibly gets more:

- **Verified+** — a ✓ badge and an offer line. **It never changes map position or ranking**; it buys trust, not placement.
- **Featured** — gold ⭐ pin, top of the list in its area, labelled `Реклама`.
- **Spotlight** — everything in Featured, with the largest pin above all others.

Subscriptions renew until cancelled; **one-off runs** last exactly the days paid for and then stop, with nothing to cancel. Extras that we fulfil by hand (deal-of-the-week, poster placement, sponsored push) are sold separately and are clearly marked as *not* automatic.

**Every paid placement is labelled**, sponsored density is deliberately limited, and placements are chosen by what a store bought — never by anything about the person looking. Full rate card, unit economics and operator setup: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)**.

### For maintainers

Purchases fulfil themselves: Stripe → signed webhook → D1 → the app's `/promos` fetch. Nothing needs hand-editing.

| Piece | Where |
| --- | --- |
| Rate card + tier rendering | `index.html` (`PROMO_PLANS`, `promoRank()`, `isAd()`) |
| Checkout, webhook, promos/orders | `worker/worker.js` (`/promote`, `/order`, `/stripe-webhook`, `/promos`) |
| Self-service billing | `/billing` → Stripe customer portal; readiness shows as `portal` on `/status` |
| Owner alerts | Telegram ping on every paid promotion and order |
| Order queue (hand-fulfilled) | `GET /orders` with `X-Admin-Key` |

It all stays inert until `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` exist — without them the buy button never appears.

## 🔒 Privacy

No accounts, no ad networks, no personal tracking. Local stores can pay for a clearly-labelled placement on the map, sold directly by us — there is no ad network involved and nothing about you is used to choose what you see. Everything you do stays in your own browser on your own device — it's never sent to a server, and nothing leaves your phone unless you choose to share it. The only things measured are anonymous, aggregate traffic (page views and visits) via **Cloudflare Web Analytics** and anonymous in-app usage (which stores/filters get used) via a small first-party service on Cloudflare — both cookieless, with no personal data and no individual-visitor or cross-site tracking. Full details: **[Privacy Policy](https://www.lvivsecondhand.com/privacy.html)** (also linked from the in-app **?** Help panel).

## 📊 Analytics & metrics (for maintainers)

Two independent, privacy-friendly analytics layers — both free-tier, both anonymous (no personal data, no cookies, no cross-site tracking):

### 1. Traffic — Cloudflare Web Analytics
- **What:** page views, visits, countries, referrers, device/browser breakdown.
- **How:** a cookieless beacon in `index.html` (`CF_ANALYTICS_TOKEN`), loaded from `static.cloudflareinsights.com`.
- **View:** Cloudflare dashboard → **Web Analytics → `www.lvivsecondhand.com`** (add this hostname in Web Analytics once the domain is live). The app now sits at its own domain root, so no path filtering is needed.

### 2. In-app behavior — custom Cloudflare Worker + D1
Anonymous events (store opens, filter/tab/language switches, add/share/export/contribute) sent from the app to a first-party collector.

| Piece | Where |
| --- | --- |
| Client `track()` | `index.html` (`METRICS_URL`, fire-and-forget via `sendBeacon`) |
| Collector Worker | `worker/worker.js` → `https://lviv-metrics.lshanalytic.workers.dev` |
| Worker config | `worker/wrangler.toml` (binds the D1 database) |
| Database | Cloudflare **D1** `lviv-metrics` — one `events` table (`ts, day, type, key, lang`) |
| Auto-deploy | `.github/workflows/deploy-worker.yml` — redeploys the Worker on any `worker/**` change |

- **Event shape:** `{ type, key, lang }` where `type` ∈ `store_open · filter · tab · lang · action`. The Worker validates against that enum and stores **no** IP, id, coordinates, or free text.
- **Deploy secrets** (repo → Settings → Secrets and variables → **Actions**): `CLOUDFLARE_API_TOKEN` (Edit Workers + D1 Edit), `CLOUDFLARE_ACCOUNT_ID`.
- **View the data:** query the `lviv-metrics` D1 database — e.g. in the Cloudflare dashboard (**Workers & Pages → D1 → lviv-metrics → Console**) or the Cloudflare MCP connector. Example:
  ```sql
  SELECT key AS store, COUNT(*) AS opens
  FROM events
  WHERE type = 'store_open' AND day >= date('now','-7 day')
  GROUP BY key ORDER BY opens DESC LIMIT 10;
  ```

Both layers are disclosed in [`privacy.html`](https://www.lvivsecondhand.com/privacy.html) (§2 and §5) and the Play Store Data Safety notes (`docs/PLAY_STORE.md`). To disable either, blank out `CF_ANALYTICS_TOKEN` / `METRICS_URL` in `index.html`.

---

# 🇺🇦 Lviv Second Hand — Пошук секонд-хендів

PWA (прогресивний веб-додаток) для пошуку та відстеження магазинів секонд-хенду у Львові.

**🔗 Посилання на застосунок:** https://www.lvivsecondhand.com/

Встановлення не обов'язкове — додаток працює у браузері, але якщо додати його на головний екран, він відкриватиметься на весь екран, як звичайний застосунок.

---

## 📲 Встановлення на Android

1. Відкрийте **Chrome** на телефоні
2. Перейдіть на https://www.lvivsecondhand.com/
3. Натисніть меню **⋮** (праворуч зверху)
4. Натисніть **«Додати на головний екран»**
5. Натисніть **Додати**
6. Застосунок з'явиться на головному екрані й відкриватиметься на весь екран 🎉

## 🍏 Встановлення на iPhone

1. Відкрийте **Safari** (саме Safari, не Chrome)
2. Перейдіть на https://www.lvivsecondhand.com/
3. Натисніть кнопку **«Поділитися»** (квадрат зі стрілкою, знизу екрана)
4. Натисніть **«На екран «Додому»»**
5. Натисніть **Додати**

> ⚠️ На iOS додавання на головний екран працює лише через Safari — Chrome на iPhone не підтримує встановлення PWA.

---

## ✨ Можливості

- 🗺️ **Карта** усіх секонд-хенд магазинів Львова
- 📍 **Показати моє місцезнаходження** — ви на карті з перемикачем GPS
- ⏱️ **Трекер циклу завезення товару** — лічить дні з останньої доставки та оцінює поточні знижки
- ⚖️ Підтримка магазинів **на кіло** та **поштучно**
- 🌐 Перемикач мови **EN / UA**
- ✅ Позначення магазинів як **відвіданих**
- 🔔 **Сповіщення про завезення** — відстежуйте магазин і отримуйте push-сповіщення того ранку, коли буде завезення (за згодою; на iOS 16.4+ потрібен встановлений застосунок)
- ➕ **Додавання**, ✏️ **редагування** та 🗑️ **видалення/приховування** магазинів
- 🤝 **Поділитися картою** та **внести** доповнення/зміни для всіх
- 🔗 **Посилання на магазин** — скопіюйте пряме посилання `?store=<id>`, що одразу відкриває цей магазин
- 💬 **Телеграм-бот** — [@Secondhandlvivbot](https://t.me/Secondhandlvivbot): `/today` — завезення сьогодні, `/cheap` — найкращі ціни на вагу
- 📣 **Просування магазину** — власник може просувати свій магазин прямо із застосунку; кожне платне розміщення позначене
- 📶 **Працює офлайн** — встановлюваний застосунок (PWA) із локальним кешуванням, без залежності від CDN

## 🤝 Обмін і внесок

Магазини, які ви додаєте чи редагуєте, зазвичай зберігаються лише на вашому пристрої. Кнопка **🤝** (праворуч зверху) дозволяє поділитися ними:

- **🔗 Копіювати посилання** — надсилає ваші додані та змінені магазини будь-кому. Відкривши посилання, людина додає ваші магазини на свою карту (дублікати пропускаються). Також можна **завантажити файл** або **скопіювати короткий код**.
- **📥 Імпорт від інших** — вставте посилання/код, який вам надіслали, або завантажте файл `.json`, щоб додати їхні магазини до своїх.
- **🌍 Внести до офіційної карти** — відкриває попередньо заповнене [звернення на GitHub](https://github.com/anonymouspartner/lviv-secondhand/issues) з вашими доповненнями та виправленнями. Після того як супровідник їх додасть, ваші зміни з’являться на карті, яку завантажують усі. (Для публікації потрібен безкоштовний акаунт GitHub.)

> Оскільки застосунок — це статичний сайт без сервера, обмін між користувачами миттєвий і приватний, а внески до *офіційної* карти проходять через GitHub, щоб супровідник міг їх переглянути та додати.

## 📣 Просування магазинів (реклама)

Власник магазину може просунути свій магазин самостійно, без звернення до когось. Відкрийте магазин у застосунку → **📣 Власник магазину? Просувати** → оберіть тариф і оплатіть у ₴ (Stripe). Усе — ціни, оплата та сторінка Stripe — за замовчуванням українською.

| Тариф | Щомісяця | Щороку | Разово 7 / 30 днів |
| --- | --- | --- | --- |
| **Verified+** | ₴250 | ₴2 500 | ₴100 / ₴250 |
| **Featured** | ₴600 | ₴6 000 | ₴200 / ₴600 |
| **Spotlight** | ₴1 200 | ₴12 000 | ₴400 / ₴1 200 |

**Що саме змінює кожен тариф** — застосунок дотримується цього, тож дорожчий тариф справді дає більше:

- **Verified+** — значок ✓ і рядок з пропозицією. **Не змінює позицію на карті чи у списку** — це довіра, а не розміщення.
- **Featured** — золота ⭐ позначка, перше місце у списку свого району, підпис `Реклама`.
- **Spotlight** — усе з Featured, найбільша позначка вище за всі інші.

Підписки діють до скасування; **разові розміщення** тривають рівно стільки днів, скільки оплачено, і завершуються — скасовувати нічого не треба. Додаткові послуги, які виконуємо вручну (знижка тижня, розміщення постера, push-розсилка), продаються окремо й чітко позначені як **не** автоматичні.

**Кожне платне розміщення позначене**, кількість реклами свідомо обмежена, і розміщення визначається тим, що купив магазин, — ніколи не тим, хто дивиться. Повний прайс і налаштування: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)** (англійською).

## 🔒 Конфіденційність

Без облікових записів, рекламних мереж і персонального стеження. Місцеві магазини можуть оплатити чітко позначене розміщення на карті — його продаємо безпосередньо ми, без рекламних мереж, і для вибору того, що ви бачите, не використовується жодна інформація про вас. Усе, що ви робите, залишається у вашому браузері на вашому пристрої — воно ніколи не надсилається на сервер і не залишає ваш телефон, доки ви самі не вирішите поділитися. Єдине, що вимірюється, — це анонімний, узагальнений трафік (перегляди та відвідування) через **Cloudflare Web Analytics** та анонімне використання додатка (які магазини/фільтри застосовують) через невеликий власний сервіс на Cloudflare — обидва без файлів cookie, без персональних даних і без відстеження окремих відвідувачів чи міжсайтового стеження. Докладніше: **[Політика конфіденційності](https://www.lvivsecondhand.com/privacy.html)** (також доступна з панелі довідки **?** у застосунку).
