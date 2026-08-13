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
- ⚡ **Flash deals** — a store can run a short paid sale (3h / 24h) with a live countdown banner and toast; follow a store on Telegram to hear the moment one goes live
- ✏️ **Suggest a correction** — send a fix via Telegram; a moderator reviews it, or a trusted contributor's own edit publishes instantly
- 🎉 **Day-0 filter** — see which stores have fresh stock today, with a suggested walking route between them
- 📶 **Works offline** — installable PWA with on-device caching, no CDN dependency

## 🗺️ Map legend

Pin **colour answers the question the app exists for: when is this store cheapest?** Second-hand prices fall as stock is picked over, so the colour tracks how far a store is through its delivery cycle. The **label** says how the store relates to you.

**Colour — where the store is in its cycle**

| Pin | Hex | Meaning |
| --- | --- | --- |
| 🟢 Green | `#17693a` | **Just restocked** — best choice, highest prices |
| 🟡 Amber | `#e0a11b` | **Mid cycle** — choice and price in balance |
| 🔴 Red | `#c0392b` | **End of cycle** — picked over, but the **best deals** |
| 🔵 Blue | `#2471a3` | **No restock data yet** for this store |
| 🟨 Gold | `#ffd23f` | **Paid placement**, always labelled as advertising |

Green → amber → red is one scale, not three categories: it is the same journey the deal meter and the store page show, from the same values (`--phase-*` in `:root`, mirrored in `PIN_COLORS`). Change it in one place.

**Label — how it relates to you**

| Label | Meaning |
| --- | --- |
| `S` | Store — not visited yet |
| `H` | HUMANA — not visited yet |
| `+` | Added by you — not visited yet |
| `✓` | **You have marked it visited** (replaces the letter; the colour stays) |
| ⭐ | Featured — a paid placement |
| 🌟 | Spotlight — the top paid tier |

**Size, ring and stacking** — ordinary pins are 36px with a white ring. Paid pins are 44px (Featured) and 50px (Spotlight), float above everything, and take a **dark ring instead of a white one** so gold never has to be told apart from amber on colour alone. Size is bought, never earned.

**Three consequences worth knowing:**

- **Blue means we genuinely don't know yet.** Cycle position comes from one of two sources. If the store publishes a **restock weekday** (`restockDay` in the dataset), the phase is computed for everyone with nothing stored — it rolls over on its own and resets to green each restock day. Otherwise it needs a **last-delivery date**, and those are per device. Stores with neither are blue. Blue is therefore a live map of where the field agent's next visit is worth most, and it turns to colour permanently as soon as a restock day is recorded.
- **Visited replaces the letter, not the colour.** A visited store keeps its cycle colour and reads `✓` — you never lose the timing signal by having been there.
- **A promoted pin never shows `✓`, and never shows its cycle colour.** Gold and the star outrank both, so on a paid pin the map tells you neither. The store's own page still does.

**Verified+ deliberately changes nothing here.** It buys a badge on the card, not a pin — which is what keeps the map honest and the two ad tiers worth their price.

**🎉 Fresh Today filter.** Isolates every store currently at day 0 — green, just restocked, whether that comes from a recorded delivery date or a published restock-day schedule. On the map it also draws a suggested walking route: a nearest-neighbour line connecting the fresh stores (starting from "Near me" if that's set), with each pin numbered to match. Not a shortest-path solver, just a quick, deterministic suggestion for a handful of same-day stores.

## 🤝 Sharing & Contributing

Stores you add or edit are normally saved only on your own device. The **🤝 button** (top-right) lets you share them:

- **🔗 Copy share link** — sends your added & edited stores to anyone. When they open the link, your stores merge onto their map (duplicates are skipped automatically). You can also **download a file** or **copy a short code** instead.
- **📥 Import from others** — paste a link/code someone sent you, or load their `.json` file, to add their stores to yours.
- **🌍 Contribute to the official map** — opens a pre-filled [GitHub issue](https://github.com/anonymouspartner/lviv-secondhand/issues) with your additions and corrections. Once a maintainer merges it, your changes ship in the map everyone downloads. (A free GitHub account is needed to post.)

> Because the app is a static site with no server, peer sharing is instant and private, while contributions to the *official* map go through GitHub so a maintainer can review and merge them.

### For maintainers

Contributions arrive as GitHub issues labelled `map-contribution`. Each issue lists the added/edited/removed stores in plain text plus a collapsible `json` block. To merge:

- **`custom`** — copy each object into `stores.json` (a plain JSON array; assign a stable `id`, fill in `hours`).
- **`overrides`** — fold each into the matching store's fields.
- **`removed`** — a list of built-in store `id`s the contributor reports as non-existent/wrong; delete those entries from `stores.json`.

A single-store correction (a field-scout visit, a Telegram edit suggestion) doesn't go through a GitHub issue at all — see **🛠️ Automated map updates** below.

## 📣 Store promotions (advertising)

Shop owners can promote their own store without contacting anyone. Open the store in the app → **📣 Own this store? Promote it** → pick a plan and pay in ₴ (Stripe). The app, the rate card and the prices are Ukrainian by default; Stripe's own payment page is not, because Stripe offers no Ukrainian locale — it falls back to Stripe's language detection.

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

## ⚡ Flash deals

A **short, paid sale window** — separate from the ongoing promotion tiers above, and priced and sold separately. Open a store → **⚡ Flash sale? Start one now** → pick a length and pay in ₴; the deal text itself is written on Stripe's own payment page, not in the app, so nobody unpaid can publish sale copy.

| Length | Price |
| --- | --- |
| **3 hours** | ₴30 |
| **24 hours** | ₴60 |
| **24 hours + Telegram alert** | ₴120 |

**Going live.** A store with a 4-digit PIN on file publishes instantly on payment. Without one (the default — there's no self-service way to set a PIN yet), the deal is held for a quick owner review and goes live once approved, usually within minutes.

**Shoppers see it two ways**: a high-contrast banner with a live countdown on the store's own page, and a floating toast shown once per app load for any store with a deal currently running — both disappear on their own the moment the deal expires, nothing to clean up.

**🔔 Follow a store's flash deals on Telegram** — tap the link on any store page to open [@Secondhandlvivbot](https://t.me/Secondhandlvivbot) and subscribe (`/stop` to unsubscribe from everything). This is separate from the restock-alert 🔔 above: it only ever fires for a paid "+ Telegram alert" deal, and it reaches you on Telegram directly, which works everywhere (no browser notification permission needed — the restock alerts need one, and iOS Safari in particular makes that a real hurdle).

### For maintainers

| Piece | Where |
| --- | --- |
| Tiers + checkout | `worker/worker.js` (`FLASH_DEAL_TIERS`, `GET /flash-deal`) |
| Webhook → publish/queue | `applyFlashDealEvent()`, `GET /flash-deal/approve` |
| Owner PIN (no UI yet — set directly) | D1 table `store_pins` |
| Subscribers + broadcast | D1 table `store_subs`, `broadcastFlashDeal()`, bot `/start sub_<id>` · `/stop` |
| Shopper-facing banner/toast | `index.html` (`activeFlashDeal()`, `tickFlashCountdowns()`) |

Needs `GH_PAT` (on both Workers — publishing a deal dispatches through the same pipeline as everything else below) and, for the owner-review path, the existing `ADMIN_KEY`. Both optional; the feature stays inert without them.

## ✏️ Community edits & the leaderboard

Anyone can propose a fix from inside the app — open a store → **Edit Store** → make the change → **📨 Submit for review via Telegram**. The app has no login, so the correction starts anonymous; it only gets a real identity the moment someone opens the Telegram link the app hands back, which is also the moment that decides what happens to it:

- **A trusted contributor** (500+ points) claiming their own submission **publishes it immediately**.
- **Everyone else's** goes to a moderator, who taps ✅ or ❌ on a Telegram message and can see exactly what's being proposed before deciding.

Approved edits earn **10 points**. **`/leaderboard`** in the bot shows the top 10 contributors.

**⏳ Early-bird perk.** When a store's flash-deal alert goes out (above), trusted contributors hear about it the instant it's live; everyone else following that store waits 15 minutes.

### For maintainers

| Piece | Where |
| --- | --- |
| Stash / claim / resolve | `worker/worker.js` (`POST /api/edit/stash` · `/claim` · `/resolve`) |
| Points + leaderboard | D1 table `contributors`, `GET /api/leaderboard` |
| Moderator ✅/❌ | Telegram bot `handleAgentCallback()`, gated to the owner + configured agent ids |
| Early-bird delay | D1 table `pending_broadcasts`, swept by a `*/5 * * * *` cron |

`MODERATOR_CHANNEL_ID` is optional — edit reviews land in the owner's own Telegram DMs if it's unset.

## 🛠️ Automated map updates

Every feature above that changes the map — a field-scout correction, a published flash deal, an approved community edit — goes through the same pipeline rather than editing `stores.json` directly:

1. A signed **`repository_dispatch`** event carries a *targeted patch* (`{ store_id, updates }`), never the whole file, so two unrelated changes landing close together can't clobber each other.
2. **`.github/workflows/update-map.yml`** applies it as a deep merge, runs it through a **schema gate** (valid JSON, required fields, coordinate ranges, no duplicate ids, ISO-formatted dates) that aborts the run on any violation, then commits straight to `main` — which *is* the deploy, since GitHub Pages serves this repo from `main` directly.

`scripts/patch-store.js` is the reusable sender (also usable as a CLI: `node scripts/patch-store.js <store_id> '<json>'`) — both Workers call the same GitHub API endpoint it wraps. Needs a `GH_PAT` (classic, `repo` scope) wherever it's called from; `repository_dispatch` can't be triggered with a workflow's own default token.

## 🔍 Field-scout tool

A faster alternative to the full `/visit` survey (see the handbook below) for a quick, structured correction while standing in a store: open `?store=<id>&agent_mode=true` from the map → **📨 Send to Telegram bot** → the bot walks through inventory cycle, restock weekday, and opening hours entirely via tappable buttons, no typing. Confirming dispatches straight through the pipeline above.

Needs `BOUNTY_SECRET` (identical value on both Workers — one signs the short-lived link, the other verifies it) and `GH_PAT` on the bot Worker.

## 💼 Business model

The app is **free for shoppers and always will be**. It is funded by the shops it sends people to — not by advertising networks, and not by anything to do with who you are.

**Revenue**

| Source | What it is |
| --- | --- |
| **Store promotions** | Verified+ / Featured / Spotlight, monthly or annual — the recurring core |
| **One-off runs** | 7 or 30 days, no subscription — for a sale week or a seasonal push |
| **Flash deals** | 3 or 24 hours, ₴30–₴120 — a single sale-day push, sold separately from the tiers above |
| **Extras** | Deal-of-the-week, poster placement, sponsored push — fulfilled by hand |

**Costs**

- **Infrastructure ≈ ₴0** — GitHub Pages, Cloudflare Workers, D1 and KV all sit inside free tiers. The app is a single static file with a self-hosted map library, so there is no server to rent and no CDN bill.
- **Payments** — Stripe fees (≈2.9% + fixed, plus ~1% currency conversion, since the account settles in USD while stores are charged in ₴).
- **Field agent** — the only meaningful variable cost: ₴80 per verified store visit plus ₴200 result bonuses (see the handbook below).

**Why it works.** Software margin is very high and infrastructure does not scale with users, so the economics turn entirely on customer acquisition. Acquiring a Featured store costs roughly 2–3 visits plus a sales commission (≈₴500–750); at ₴600/month it repays in about a month and everything after that is close to pure margin.

**Why a store pays.** Shoppers are already on the map looking for exactly what that store sells, and the offer line (`-10% з застосунком`) makes the return measurable — the store can count who mentions it.

**Where it is now.** The purchase path is live end to end and self-fulfils. The owner is closing the first deals by hand to validate pricing before the agent starts selling. Full rate card, unit economics and rollout plan: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)**.

## 💬 Telegram bot

**[@Secondhandlvivbot](https://t.me/Secondhandlvivbot)** — the app's companion. Every result links back into the map, so a shopper can go from a Telegram message to directions in two taps. The interface is Ukrainian.

**Anyone can use:**

| Command | What it does |
| --- | --- |
| `/today` | Stores getting new stock today |
| `/cheap` | Best by-weight prices right now |
| `/submit` | Submit your own store (for shop owners) |
| `/materials` | Printable flyers, posters and QR stickers |
| `/leaderboard` | Top 10 community contributors by points |
| `/stop` | Unsubscribe from every store's flash-deal alerts |
| `/help` | Command list and info |

**Field agent & owner only** — these appear in the menu only for authorised Telegram IDs, and are refused for anyone else:

| Command | What it does |
| --- | --- |
| `/visit` | Log a store visit — GPS, storefront photo, questionnaire |
| `/myvisits` | Your own logged visits |
| `/pay` | The live pay scheme, from the configured rates |
| `/job` | The full job description |
| `/cancel` | Abandon a half-finished `/visit` |
| `/report` · `/export` | Owner only — totals, estimated pay, CSV export |

The menu is **self-managing**: the bot pushes its own command list to Telegram on startup, so there is no BotFather `/setcommands` step. Bump `CMD_VER` in `telegram-bot/worker.js` after editing the lists to force a re-sync.

> The bot also carries the money side: a Telegram message arrives the moment any promotion or à la carte order is paid.

## 🎒 Field agent handbook

Surveying ~90 stores and keeping their restock schedules accurate is fieldwork, so the project employs a local agent. The complete handbook — bilingual, and the document the agent actually works from — is **[`docs/FIELD_AGENT.md`](docs/FIELD_AGENT.md)**.

**Pay** — ₴80 per verified visit, plus ₴200 per verifiable result (QR poster placed, or store owner signed up; both can apply to one visit). Suggested pace 8–12 stores/day. Paid weekly against `/report` and `/export`.

**Bonus vs. commission** — a **bonus** pays for the *action* (poster placed, lead captured) even if that store never buys. A **sales commission** pays only when a store actually subscribes and pays. The bonus rewards pipeline; the commission rewards revenue.

**What counts as a visit** — GPS reading, clear storefront photo, and every question answered. Incomplete submissions don't count, the bot records distance from the store's map pin so far-off visits get flagged, and re-visiting the same store in one survey cycle doesn't earn a second base.

**Updating the map** — restock days, hours, names, addresses and notes are edited **in the app**, then submitted via 🤝 → 🌍 Contribute → 🚀 Submit on GitHub, which opens a pre-filled issue (a free GitHub account is required). Photos, chat and live location go through Telegram, which the app can't do.

**Phase 2** — once pricing is validated, the agent also sells promotions and earns a one-time commission per signed store. Not active yet.

## 🔒 Privacy

No accounts, no ad networks, no personal tracking. Local stores can pay for a clearly-labelled placement on the map, sold directly by us — there is no ad network involved and nothing about you is used to choose what you see. Browsing, adding, and editing stores all stay in your own browser on your own device — none of it is ever sent to a server unless you choose to share it. The only things measured are anonymous, aggregate traffic (page views and visits) via **Cloudflare Web Analytics** and anonymous in-app usage (which stores/filters get used) via a small first-party service on Cloudflare — both cookieless, with no personal data and no individual-visitor or cross-site tracking.

The exception is the **Telegram-based features** (flash-deal alerts, field-scout corrections, community edit suggestions) — these are opt-in and inherently involve Telegram: your chat id is stored so a subscription or a contribution has somewhere to go, alongside a display name and points total if you submit an edit. None of it is linked to your browsing on the map, and none of it is shared beyond what running the feature requires. Full details: **[Privacy Policy](https://www.lvivsecondhand.com/privacy.html)** (also linked from the in-app **?** Help panel) — *note: the policy document itself is still being updated to reflect this; treat this README as the more current source until it is.*

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
| Database | Cloudflare **D1** `lviv-metrics` — the `events` table (`ts, day, type, key, lang`); the same database also holds promotions, flash deals, and the other tables described in their own sections above |
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
- ⚡ **Спалах-знижки** — магазин може запустити короткий платний розпродаж (3 год / 24 год) з таймером зворотного відліку; стежте за магазином у Telegram, щоб дізнатися, щойно знижка стане активною
- ✏️ **Запропонувати виправлення** — надішліть правку через Telegram; модератор перевірить її, або довірений редактор одразу опублікує свою
- 🎉 **Фільтр «Свіжий сьогодні»** — побачте, які магазини мають свіжий товар сьогодні, з пропонованим маршрутом між ними
- 📶 **Працює офлайн** — встановлюваний застосунок (PWA) із локальним кешуванням, без залежності від CDN

## 🗺️ Позначки на карті

**Колір позначки відповідає на головне питання застосунку: коли в цьому магазині найдешевше?** Ціни в секонд-хендах знижуються, поки товар розбирають, тож колір показує, як далеко магазин просунувся у своєму циклі завезення. **Напис** каже, як магазин стосується вас.

**Колір — де магазин у своєму циклі**

| Позначка | Код | Значення |
| --- | --- | --- |
| 🟢 Зелена | `#17693a` | **Щойно завезли** — найкращий вибір, найвищі ціни |
| 🟡 Бурштинова | `#e0a11b` | **Середина циклу** — баланс вибору й ціни |
| 🔴 Червона | `#c0392b` | **Кінець циклу** — вибір менший, але **найкращі ціни** |
| 🔵 Синя | `#2471a3` | **Немає даних** про завезення для цього магазину |
| 🟨 Золота | `#ffd23f` | **Платне розміщення**, завжди позначене як реклама |

Зелений → бурштиновий → червоний — це одна шкала, а не три категорії: той самий шлях показують шкала знижок і сторінка магазину, з тих самих значень (`--phase-*` у `:root`, віддзеркалені в `PIN_COLORS`). Змінюється в одному місці.

**Напис — як магазин стосується вас**

| Напис | Значення |
| --- | --- |
| `S` | Магазин — ще не відвіданий |
| `H` | HUMANA — ще не відвідана |
| `+` | Доданий вами — ще не відвіданий |
| `✓` | **Ви позначили його відвіданим** (замінює літеру; колір лишається) |
| ⭐ | Featured — платне розміщення |
| 🌟 | Spotlight — найвищий платний тариф |

**Розмір, обідок і порядок** — звичайні позначки 36px з білим обідком. Платні — 44px (Featured) і 50px (Spotlight), вони вище за всіх і мають **темний обідок замість білого**, щоб золотий ніколи не доводилося відрізняти від бурштинового лише за кольором. Розмір купують, а не заслуговують.

**Три наслідки, які варто знати:**

- **Синій означає, що ми справді ще не знаємо.** Місце в циклі береться з одного з двох джерел. Якщо магазин має **день завезення** (`restockDay` у даних), фаза обчислюється для всіх без нічого збереженого — вона змінюється сама й скидається на зелений щотижня в день завезення. Інакше потрібна **дата останнього завезення**, а вона зберігається лише на пристрої. Магазини без жодного з цих даних — сині. Тож синій показує, де візит польового агента вартий найбільше, і стає кольором назавжди, щойно записано день завезення.
- **Відвідано замінює літеру, а не колір.** Відвіданий магазин зберігає колір циклу й показує `✓` — ви не втрачаєте сигнал про час.
- **Просунута позначка ніколи не показує ані `✓`, ані колір циклу.** Золотий і зірка мають пріоритет над обома, тож на платній позначці карта не скаже ні того, ні іншого. Сторінка самого магазину — скаже.

**Verified+ навмисно нічого тут не змінює.** Він купує значок на картці, а не позначку на карті — саме це тримає карту чесною, а два рекламні тарифи — вартими своєї ціни.

**Фільтр «🎉 Свіжий сьогодні».** Показує лише магазини, які зараз на дні 0 — щойно завезли, чи то за записаною датою поставки, чи за опублікованим графіком завезення. На карті цей фільтр також малює пропонований маршрут: лінію найближчого сусіда між свіжими магазинами (починаючи з «Поруч», якщо його встановлено), а кожна позначка отримує відповідний номер. Це не пошук найкоротшого шляху, а швидка й однозначна підказка для кількох магазинів, що завезли товар сьогодні.

## 🤝 Обмін і внесок

Магазини, які ви додаєте чи редагуєте, зазвичай зберігаються лише на вашому пристрої. Кнопка **🤝** (праворуч зверху) дозволяє поділитися ними:

- **🔗 Копіювати посилання** — надсилає ваші додані та змінені магазини будь-кому. Відкривши посилання, людина додає ваші магазини на свою карту (дублікати пропускаються). Також можна **завантажити файл** або **скопіювати короткий код**.
- **📥 Імпорт від інших** — вставте посилання/код, який вам надіслали, або завантажте файл `.json`, щоб додати їхні магазини до своїх.
- **🌍 Внести до офіційної карти** — відкриває попередньо заповнене [звернення на GitHub](https://github.com/anonymouspartner/lviv-secondhand/issues) з вашими доповненнями та виправленнями. Після того як супровідник їх додасть, ваші зміни з’являться на карті, яку завантажують усі. (Для публікації потрібен безкоштовний акаунт GitHub.)

> Оскільки застосунок — це статичний сайт без сервера, обмін між користувачами миттєвий і приватний, а внески до *офіційної* карти проходять через GitHub, щоб супровідник міг їх переглянути та додати.

## 📣 Просування магазинів (реклама)

Власник магазину може просунути свій магазин самостійно, без звернення до когось. Відкрийте магазин у застосунку → **📣 Власник магазину? Просувати** → оберіть тариф і оплатіть у ₴ (Stripe). Застосунок, прайс і ціни — українською за замовчуванням; сама сторінка оплати Stripe — ні, бо Stripe не має української локалі, тож мова визначається автоматично.

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

## ⚡ Спалах-знижки

**Короткий платний розпродаж** — окремо від постійних тарифів вище, з окремим ціноутворенням. Відкрийте магазин → **⚡ Спалах-знижка? Почати зараз** → оберіть тривалість і оплатіть у ₴; сам текст пропозиції пишеться на сторінці оплати Stripe, а не в застосунку, тож ніхто, хто не заплатив, не може опублікувати текст розпродажу.

| Тривалість | Ціна |
| --- | --- |
| **3 години** | ₴30 |
| **24 години** | ₴60 |
| **24 години + сповіщення в Telegram** | ₴120 |

**Публікація.** Магазин зі збереженим 4-значним PIN публікує знижку одразу після оплати. Без нього (за замовчуванням — сервісу самостійного встановлення PIN поки немає) знижка чекає на швидку перевірку власником і зʼявляється після підтвердження, зазвичай протягом кількох хвилин.

**Покупці бачать це двома способами**: яскравий банер з таймером на сторінці магазину та плаваюче повідомлення, що показується раз на завантаження застосунку для будь-якого магазину з активною знижкою — обидва зникають самі, щойно знижка завершується.

**🔔 Стежте за спалах-знижками магазину в Telegram** — натисніть посилання на сторінці будь-якого магазину, щоб відкрити [@Secondhandlvivbot](https://t.me/Secondhandlvivbot) і підписатися (`/stop`, щоб відписатися від усього). Це окремо від сповіщень про завезення 🔔 вище — тут повідомлення надходить лише для платної знижки «+ сповіщення в Telegram», і приходить прямо в Telegram, що працює всюди (дозвіл браузера на сповіщення не потрібен — на відміну від сповіщень про завезення, де він потрібен, а на iOS Safari це особливо відчутне обмеження).

## ✏️ Спільнотні правки та рейтинг

Будь-хто може запропонувати виправлення прямо із застосунку — відкрийте магазин → **Редагувати** → внесіть зміну → **📨 Надіслати на перевірку через Telegram**. У застосунку немає входу в акаунт, тож правка спершу анонімна; вона отримує справжню особу лише тоді, коли хтось відкриває надіслане застосунком посилання в Telegram — і саме ця мить визначає, що станеться далі:

- **Довірений редактор** (500+ балів), який підтверджує власне подання, **публікує його одразу**.
- **Усі інші** подання йдуть до модератора, який натискає ✅ або ❌ у повідомленні в Telegram, бачачи точно, що пропонується, перш ніж вирішити.

Затверджені правки дають **10 балів**. **`/leaderboard`** у боті показує топ-10 учасників.

**⏳ Бонус для перших.** Коли надсилається сповіщення про спалах-знижку магазину (вище), довірені редактори дізнаються про неї миттєво; усі інші, хто стежить за цим магазином, чекають 15 хвилин.

## 🛠️ Автоматичне оновлення карти

Кожна функція вище, що змінює карту — правка від польового агента, опублікована спалах-знижка, затверджена спільнотна правка — проходить через один і той самий конвеєр, а не редагує `stores.json` напряму:

1. Підписана подія **`repository_dispatch`** несе *цільовий патч* (`{ store_id, updates }`), ніколи не весь файл, тож дві незалежні зміни, що надійшли майже одночасно, не затруть одна одну.
2. **`.github/workflows/update-map.yml`** застосовує його як глибоке злиття, пропускає через **перевірку схеми** (коректний JSON, обов'язкові поля, діапазони координат, відсутність дублікатів id, дати у форматі ISO), яка зупиняє процес при будь-якому порушенні, а потім комітить прямо в `main` — що і є публікацією, оскільки GitHub Pages обслуговує цей репозиторій прямо з `main`.

## 🔍 Інструмент польового агента

Швидша альтернатива повній анкеті `/visit` (див. довідник нижче) для швидкого структурованого виправлення просто в магазині: відкрийте `?store=<id>&agent_mode=true` з карти → **📨 Надіслати в Telegram-бота** → бот проведе через цикл поставок, день завезення та години роботи повністю кнопками, без набору тексту. Підтвердження надсилає зміни через той самий конвеєр вище.

## 💼 Бізнес-модель

Застосунок **безкоштовний для покупців і залишиться таким**. Його фінансують магазини, до яких він приводить людей, — а не рекламні мережі й нічого, повʼязане з тим, хто ви є.

**Дохід**

| Джерело | Що це |
| --- | --- |
| **Просування магазинів** | Verified+ / Featured / Spotlight, щомісяця або щороку — постійна основа |
| **Разові розміщення** | 7 або 30 днів, без підписки — на тиждень розпродажу чи сезонний поштовх |
| **Спалах-знижки** | 3 або 24 години, ₴30–₴120 — поштовх на один день розпродажу, продається окремо від тарифів вище |
| **Додаткові послуги** | Знижка тижня, розміщення постера, push-розсилка — виконуємо вручну |

**Витрати**

- **Інфраструктура ≈ ₴0** — GitHub Pages, Cloudflare Workers, D1 і KV вкладаються в безкоштовні тарифи. Застосунок — один статичний файл із власною бібліотекою карт, тож немає ні сервера в оренду, ні рахунків за CDN.
- **Оплати** — комісії Stripe (≈2,9% + фіксована, плюс ~1% за конвертацію валют, бо рахунок у USD, а магазини платять у ₴).
- **Польовий агент** — єдина суттєва змінна витрата: ₴80 за перевірений візит плюс бонуси ₴200 (див. довідник нижче).

**Чому це працює.** Маржа програмного продукту дуже висока, а інфраструктура не дорожчає з кількістю користувачів, тож усе тримається на вартості залучення. Залучити магазин на Featured коштує приблизно 2–3 візити плюс комісія (≈₴500–750); за ₴600/місяць це окупається приблизно за місяць, а далі — майже чиста маржа.

**Чому магазин платить.** Покупці вже на карті й шукають саме те, що продає цей магазин, а рядок з пропозицією (`-10% із застосунком`) робить віддачу вимірюваною — магазин може рахувати, хто його згадав.

**Де це зараз.** Шлях оплати працює повністю й виконується автоматично. Власник закриває перші угоди вручну, щоб перевірити ціни, перш ніж продажем займеться агент. Повний прайс і план: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)** (англійською).

## 💬 Телеграм-бот

**[@Secondhandlvivbot](https://t.me/Secondhandlvivbot)** — супутник застосунку. Кожен результат посилається назад на карту, тож від повідомлення в Telegram до маршруту — два дотики. Інтерфейс українською.

**Доступно всім:**

| Команда | Що робить |
| --- | --- |
| `/today` | Магазини із завезенням сьогодні |
| `/cheap` | Найкращі ціни на вагу зараз |
| `/submit` | Додати свій магазин (для власників) |
| `/materials` | Матеріали для друку: флаєри, постери, QR-наліпки |
| `/leaderboard` | Топ-10 учасників спільноти за балами |
| `/stop` | Відписатися від усіх сповіщень про спалах-знижки |
| `/help` | Команди та інформація |

**Лише для агента та власника** — зʼявляються в меню тільки для дозволених Telegram ID, іншим відмовлено:

| Команда | Що робить |
| --- | --- |
| `/visit` | Записати візит: GPS, фото вітрини, анкета |
| `/myvisits` | Ваші записані візити |
| `/pay` | Актуальна схема оплати з налаштованих ставок |
| `/job` | Повний опис вакансії |
| `/cancel` | Скасувати незавершений `/visit` |
| `/report` · `/export` | Лише власник — підсумки, оплата, експорт CSV |

Меню **керує собою саме**: бот надсилає власний список команд у Telegram під час запуску, тож крок `/setcommands` у BotFather не потрібен. Після редагування списків змініть `CMD_VER` у `telegram-bot/worker.js`, щоб примусити пересинхронізацію.

> Бот також відповідає за гроші: повідомлення приходить щойно оплачено будь-яке просування чи додаткову послугу.

## 🎒 Довідник польового агента

Обстежити ~90 магазинів і підтримувати графіки завезення актуальними — це польова робота, тож у проєкті працює місцевий агент. Повний довідник — двомовний, саме той, з якого працює агент — **[`docs/FIELD_AGENT.md`](docs/FIELD_AGENT.md)**.

**Оплата** — ₴80 за перевірений візит плюс ₴200 за кожен підтверджений результат (розміщено QR-постер або власник зареєструвався; обидва можуть бути в одному візиті). Орієнтир — 8–12 магазинів на день. Виплати щотижня за `/report` і `/export`.

**Бонус чи комісія** — **бонус** платиться за *дію* (постер розміщено, лід зібрано), навіть якщо магазин ніколи не купить. **Комісія з продажу** платиться лише коли магазин справді підписався й заплатив. Бонус винагороджує воронку, комісія — дохід.

**Що вважається візитом** — показник GPS, чітке фото вітрини та відповіді на всі питання. Неповні подання не зараховуються, бот фіксує відстань від позначки магазину на карті, тож віддалені візити позначаються для перевірки, а повторний візит до того ж магазину в одному циклі не дає другої бази.

**Оновлення карти** — дні завезення, години, назви, адреси й нотатки редагуються **в застосунку**, а потім надсилаються через 🤝 → 🌍 Внести → 🚀 Надіслати на GitHub, що відкриває заповнене звернення (потрібен безкоштовний акаунт GitHub). Фото, спілкування та геолокація в реальному часі — через Telegram, чого застосунок не вміє.

**Фаза 2** — коли ціни підтвердяться, агент також продаватиме просування й отримуватиме разову комісію за кожен підписаний магазин. Ще не активна.

## 🔒 Конфіденційність

Без облікових записів, рекламних мереж і персонального стеження. Місцеві магазини можуть оплатити чітко позначене розміщення на карті — його продаємо безпосередньо ми, без рекламних мереж, і для вибору того, що ви бачите, не використовується жодна інформація про вас. Перегляд карти, додавання й редагування магазинів залишаються у вашому браузері на вашому пристрої — нічого з цього не надсилається на сервер, доки ви самі не вирішите поділитися. Єдине, що вимірюється, — це анонімний, узагальнений трафік (перегляди та відвідування) через **Cloudflare Web Analytics** та анонімне використання додатка (які магазини/фільтри застосовують) через невеликий власний сервіс на Cloudflare — обидва без файлів cookie, без персональних даних і без відстеження окремих відвідувачів чи міжсайтового стеження.

Виняток — **функції на основі Telegram** (сповіщення про спалах-знижки, правки польового агента, спільнотні пропозиції змін): вони добровільні (opt-in) і за своєю суттю повʼязані з Telegram — ваш chat id зберігається, щоб було куди надсилати підписку чи внесок, а також імʼя для показу й кількість балів, якщо ви пропонуєте правку. Ніщо з цього не повʼязується з вашою активністю на карті й не передається понад те, що потрібно для роботи функції. Докладніше: **[Політика конфіденційності](https://www.lvivsecondhand.com/privacy.html)** (також доступна з панелі довідки **?** у застосунку) — *примітка: сам документ політики ще оновлюється відповідно до цього; до того часу вважайте цей README актуальнішим джерелом.*
