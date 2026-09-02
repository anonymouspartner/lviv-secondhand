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
- 🆕 **Daily-drop stores** — shops that restock every day and only rotate seasonally are marked as such instead of being forced into a cycle countdown
- ⚖️ Supports both **by-KG** and **itemized** stores
- 🌐 **EN / UA** language toggle
- ✅ Mark stores as **visited**
- 🔔 **Restock alerts** — follow a store and hear the morning it restocks. Browser push where the browser supports it; where it doesn't (iOS without the app installed) the same button hands you a Telegram link instead, so the alert is available on every device
- ➕ **Add**, ✏️ **edit**, and 🗑️ **remove/hide** stores
- 🤝 **Contribute** additions/edits for review, and **back up** everything on your device
- 🔗 **Link to a store** — copy a direct `?store=<id>` link that opens straight on that store
- 💬 **Telegram bot** — [@Secondhandlvivbot](https://t.me/Secondhandlvivbot): a tap-through menu plus `/today`, `/day` (any weekday), `/rare` and `/cheap`
- 📸 **Instagram** — [@secondhandlvivbot](https://www.instagram.com/secondhandlvivbot/): which stores have gone longest since a restock, posted automatically every Monday
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
| 🟣 Purple | `#6b3fa0` | **Restocks daily** — no cycle to track, any day is a good day |
| 🟨 Gold | `#ffd23f` | **Paid placement**, always labelled as advertising |

Green → amber → red is one scale, not three categories: it is the same journey the deal meter and the store page show, from the same values (`--phase-*` in `:root`, mirrored in `PIN_COLORS`). Change it in one place.

**Purple sits outside that scale on purpose.** Some shops put out new stock every day and only rotate the full collection seasonally — they have no cycle position to be early or late in. Reusing blue would have read as "we don't know yet" when the truth is the opposite, so they get their own colour and skip the day-count entirely (`dailyDrop` in the dataset).

**Label — the chain, when there is one**

The letter inside a pin is the **chain**, so a shopper can spot a familiar brand without opening anything. Unbranded independents carry no letter — a letter only earns its place once a chain has more than one pin.

| Label | Meaning |
| --- | --- |
| `H` | HUMANA |
| `C` | Світ секонд-хенду |
| `E` | EconomClass |
| `Є` | Євро Тренд |
| `B` | ЄвроБренд |
| `S` | Сток та секонд хенд |
| `M` | МЮНХЕН |
| `L` | Birka! Lux |
| *(none)* | Independent — not part of a mapped chain |
| `+` | Added by you |
| `✓` | **You have marked it visited** (replaces the letter; the colour stays) |
| ⭐ | Featured — a paid placement |
| 🌟 | Spotlight — the top paid tier |

`B`, `S`, `M` and `L` are deliberately not their chains' own first letters: Cyrillic `С` and `Є` already stand for Світ and Євро Тренд, so a lookalike initial would be worse than a distinct glyph. The list lives in `BRAND_LABEL` (`index.html`).

**Size, ring and stacking** — ordinary pins are 36px with a white ring. Paid pins are 44px (Featured) and 50px (Spotlight), float above everything, and take a **dark ring instead of a white one** so gold never has to be told apart from amber on colour alone. Size is bought, never earned.

**Three consequences worth knowing:**

- **Blue means we genuinely don't know yet.** Cycle position is resolved in a fixed priority order, first match wins: a **delivery date you recorded on this device** (an observation, and the freshest thing we have for you specifically) → a **published calendar** of dated drops (`restockDates`, which states every drop rather than one, so it stays right across an irregular gap) → a **delivery date another visitor contributed** (`restock_date`) → the store's **published restock weekday** (`restockDay`, shared data that works for every visitor with nothing stored, but only on a weekly cycle, where a weekday alone pins the position down). Stores with none of those are blue. Blue is therefore a live map of where the field agent's next visit is worth most, and it turns to colour permanently as soon as any shared source is recorded. Daily-drop stores are exempt from this entirely — they're purple regardless.
- **Visited replaces the letter, not the colour.** A visited store keeps its cycle colour and reads `✓` — you never lose the timing signal by having been there.
- **A promoted pin never shows `✓`, and never shows its cycle colour.** Gold and the star outrank both, so on a paid pin the map tells you neither. The store's own page still does.

**Verified+ deliberately changes nothing here.** It buys a badge on the card, not a pin — which is what keeps the map honest and the two ad tiers worth their price.

**🎉 Fresh Today filter.** Isolates every store currently at day 0 — green, just restocked, whether that comes from a recorded delivery date or a published restock-day schedule. On the map it also draws a suggested walking route: a nearest-neighbour line connecting the fresh stores (starting from "Near me" if that's set), with each pin numbered to match. Not a shortest-path solver, just a quick, deterministic suggestion for a handful of same-day stores.

## 🤝 Sharing & Contributing

Stores you add or edit are saved only on your own device. The **🤝 button** (top-right) is where they leave it:

- **🗺️ Add to the official map** — sends your additions and corrections to the maintainer for review. **No GitHub account needed.** The app posts to the metrics Worker, the maintainer gets a ✅/❌ in Telegram, and only an approval creates the GitHub issue (server-side, via the API).
- **🏪 Own a store?** and **🔑 I own this store** — an owner submitting their shop, or claiming one already on the map. Both go through the same Telegram approval. Approving a *claim* mints that store's 4-digit PIN, which lets a flash deal the owner buys publish immediately instead of waiting for review.
- **🛟 Backup & restore** — a complete snapshot of everything this device holds (visits, delivery dates, added stores, edits, follows), saved as a file you keep. Restoring puts it all back.

> Peer-to-peer sharing (share links, codes, and importing someone else's map) was removed: everything now flows through the same reviewed pipeline, so the shared map has one path in and one place where quality is checked.

### For maintainers

Approving a submission in Telegram opens a GitHub issue labelled `map-contribution` (or `owner-submission`). Each lists the added/edited/removed stores in plain text. To merge:

- **`custom`** — copy each object into `stores.json` (a plain JSON array; assign a stable `id`, fill in `hours`).
- **`overrideList`** — each entry is `{ id, name, changes }`; fold `changes` into the matching store's fields. (The raw `overrides` map the bundle used to also carry was dropped — it duplicated this same data for no reader, and the redundancy pushed real bundles over the request size limit.)
- **`removed`** — a list of built-in store `id`s the contributor reports as non-existent/wrong; delete those entries from `stores.json`.

**Diff every correction against current `stores.json` before applying it.** A contribution is a snapshot of one device's local edits at submit time, so a large batch routinely arrives mostly already-applied — and can carry values that are now *stale*, if the same store was fixed through another route since. Applying such a batch wholesale silently reverts the newer fix. At more than a handful of corrections, script the comparison rather than eyeballing it. A contributor can clear their own superseded edits with **✏️ Edit store → ↺ Reset to official data**.

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

**🔔 Follow a store's flash deals on Telegram** — tap the link on any store page to open [@Secondhandlvivbot](https://t.me/Secondhandlvivbot) and subscribe (`/stop` to unsubscribe from everything). This is separate from the restock-alert 🔔 above: it only ever fires for a paid "+ Telegram alert" deal, never for an ordinary restock. Both are now available on Telegram — restock alerts use `rsub_<id>`, flash deals use `sub_<id>`, and `/stop` clears both at once.

### For maintainers

| Piece | Where |
| --- | --- |
| Tiers + checkout | `worker/worker.js` (`FLASH_DEAL_TIERS`, `GET /flash-deal`) |
| Webhook → publish/queue | `applyFlashDealEvent()`, `GET /flash-deal/approve` |
| Owner PIN (no UI yet — set directly) | D1 table `store_pins` |
| Subscribers + broadcast | D1 table `store_subs`, `broadcastFlashDeal()`, bot `/start sub_<id>` · `/stop` |
| Restock alerts (Telegram) | D1 table `tg_restock_subs`, `/api/rsub`, bot `/start rsub_<id>`, swept by the daily cron beside `push_subs` |
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
- **Field agent** — the only meaningful variable cost: ₴80 per verified store visit, ₴200 result bonuses, plus smaller public-poster and material-expense reimbursements (see the handbook below).

**Why it works.** Software margin is very high and infrastructure does not scale with users, so the economics turn entirely on customer acquisition. Acquiring a Featured store costs roughly 2–3 visits plus a sales commission (≈₴500–750); at ₴600/month it repays in about a month and everything after that is close to pure margin.

**Why a store pays.** Shoppers are already on the map looking for exactly what that store sells, and the offer line (`-10% з застосунком`) makes the return measurable — the store can count who mentions it.

**Where it is now.** The purchase path is live end to end and self-fulfils. The owner is closing the first deals by hand to validate pricing before the agent starts selling. Full rate card, unit economics and rollout plan: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)**.

## 📸 Instagram

[@secondhandlvivbot](https://www.instagram.com/secondhandlvivbot/) — the same data the map renders, in a form people scroll past on a phone.

**The weekly deals post is automatic.** `.github/workflows/deals-image.yml` regenerates `marketing/deals-this-week.jpg` every Monday from the same `/cheap` ranking the bot uses, commits it (GitHub Pages then serves it at a stable URL), and calls `instagram-post.yml` to publish it with a caption written from that week's actual ranking. It only posts when the ranking has **changed** — reposting an identical image every week trains people to scroll past it.

Anything else is posted by hand: **Actions → Post to Instagram → Run workflow**, picking one of the images in `marketing/instagram/`. Tick **`dry_run`** to run the pre-flights and stop before posting — use it after changing a secret, so verifying a config change doesn't cost a real post.

### For maintainers

| Piece | What it is |
| --- | --- |
| `tools/social/promo.mjs` | 4 evergreen posts about the app × 2 sizes, counts read live from `stores.json` |
| `tools/social/avatar.mjs` | Profile photo, 3 variants, drawn from `favicon.svg`'s vector geometry |
| `.github/workflows/instagram-post.yml` | Publishes one image. `workflow_dispatch` + `workflow_call`; no-ops without secrets |
| `.github/workflows/instagram-token-check.yml` | Weekly token check that **messages the owner on Telegram** when it breaks |

Setup lives in **[`docs/INSTAGRAM.md`](docs/INSTAGRAM.md)**. Two things that will bite otherwise:

- **This uses the *Instagram Login* API path** (`graph.instagram.com`), not Facebook Login. The two are incompatible and most tutorials online document the other one — the permission names, the token source and the endpoints all differ.
- **Tokens expire 60 days after issue, and this path cannot report how long is left.** That's what the token-check workflow is for: it turns a silent two-month failure into a Telegram message the same week. Refresh with `refresh_access_token` (no app secret needed).

Images must be **JPEG** — the API rejects PNG with a generic container error that never mentions the format.

### Paid ads on Instagram — you approve, then it posts

A store buying a flash deal now also queues an **Instagram advertisement**. It is queued, never posted: the only route from a completed payment to the public feed is you tapping approve.

1. Stripe webhook → `queueInstagramAd()` writes a row to `instagram_ads` as `rendering` and fires a `repository_dispatch`.
2. **`instagram-ad.yml`** renders the ad, writes its caption, commits both, waits for Pages to serve the image, and sends it to you on Telegram as a photo with ✅ / ❌ links. **It publishes nothing.**
3. Tapping ✅ hits the Worker's `/ad/approve?id=…&t=…`, authorised by a **per-ad token**, which fires a second dispatch.
4. **`instagram-ad-publish.yml`** reads the committed caption back off disk and hands it to `instagram-post.yml`.

Reading the caption back from the committed file is what makes "you approve exactly what publishes" true rather than merely intended — the file quoted in your Telegram message is the same file the publisher reads.

Approving the ad is **deliberately separate** from approving the flash deal for the map. The same words can be fine on a store page and wrong on a public feed, so they are two decisions.

| Piece | Where |
| --- | --- |
| Queue + approve/reject | `worker/worker.js` — `instagram_ads`, `queueInstagramAd()`, `/ad/approve`, `/ad/reject` |
| Render | `tools/social/ad-image.mjs` |
| Queue for approval | `.github/workflows/instagram-ad.yml` (also hand-runnable for a test render) |
| Publish after approval | `.github/workflows/instagram-ad-publish.yml` |

**What queues an ad, and what doesn't:**

| Event | Queues an ad? |
| --- | --- |
| Flash deal paid | Yes — the deal text is a required checkout field |
| Tier bought (Verified+ / Featured / Spotlight, monthly, annual or one-off run) | Yes, **if** the store supplied the optional offer line |
| Tier bought with no offer line | No — the Telegram notification says so, so you can ask the store for one |
| **Subscription renewal** | **No** |

Renewal is deliberately excluded. A subscription bills every month, so queueing there would hand you one approval per paying store per month, forever, each showing the same offer as the last. Recurring presence is what the weekly deals post already provides.

An offer line is required because inventing copy for someone else's paid advertisement is not ours to write. A tier bought without one still gets every on-map placement it paid for.

**No new repository secrets are needed** — every value this workflow wants is one the repo already holds, under *Settings → Secrets and variables → Actions*. Each row below reads an existing name first and only falls back to an alias, so there is nothing to add and nothing to keep in sync:

| Reads | Value | Without it |
| --- | --- | --- |
| `ADMIN_KEY`, else `WORKER_ADMIN_KEY` | the admin key. `deploy-worker.yml` installs `ADMIN_KEY` on the Worker with `wrangler secret put`, so the two match by construction — which is exactly why a second name for it is a liability, not a spare | a hand-run test cannot register its ad, and fails with HTTP 401 (sent as a header, never in a URL) |
| `BOT_TOKEN`, else `TELEGRAM_BOT_TOKEN` | the Telegram bot token (BotFather → *My bots* → *API Token*). This repo has held it under the second name since before the first existed | no approval request is sent, and the token watchdog cannot warn you either |
| `OWNER_ID`, else `worker/wrangler.toml` | your Telegram chat id — `1212541015`, already a plain var in both `wrangler.toml` files, so the secret is optional. A chat id is not a credential | same |

> Resist adding a second secret for a value the repo already stores. It has now
> gone wrong twice — `WORKER_ADMIN_KEY` beside `ADMIN_KEY`, and `BOT_TOKEN`
> beside `TELEGRAM_BOT_TOKEN` — and both times the duplicate silently held a
> different value while looking correct in the settings list.

A missing `BOT_TOKEN`/`OWNER_ID` **fails the run**, deliberately: this workflow's job is to queue *and ask*, and an ad nobody can be asked about would otherwise sit in the queue behind a green tick.

### Featuring a store without claiming it paid

Not every store post is an ad. `Feature a store on Instagram (not an ad)`
(`.github/workflows/instagram-feature.yml`) renders a card for any store on the
map and posts it — with **no** sponsorship claim on it.

The differences from the paid template are deliberate:

| | Paid ad | Feature |
| --- | --- | --- |
| Trigger | a completed payment | you, typing a store id |
| Says | `РЕКЛАМА · SPONSORED`, `Розміщення оплачене магазином` | `Не реклама. Магазин не платив за це розміщення.` |
| Look | dark green ground, acid slab | paper ground, green ink |
| Copy | the store's own offer line, buyer-supplied | nothing but `stores.json` fields |

Saying nothing would have been the wrong default. Once *some* store posts are
paid, an unlabelled one is ambiguous rather than neutral — so the feature card
states the negative outright, and the whole visual identity is inverted so the
two are told apart at thumbnail size, where nobody reads a disclosure line.

There is **no text input**: the headline is derived from `restockDay` or
`cycle`, and the rest is name, address, phone and hours. Nothing on the card can
be bought, and no sentence can be put in a shop's mouth. A store with neither a
restock day nor a cycle gets no schedule claim at all rather than a
plausible-sounding guess.

`publish` is **false by default** — the first run renders, commits and sends the
card to Telegram to look at; run it again with `publish` ticked to post that same
committed file. There is no approval queue here because there is nothing to
approve against: a payment triggers an ad, but a person triggers a feature, and
adding a token endpoint would guard a decision that was never automatic.

### Why approval links carry a token, not the admin key

The approval link travels through Telegram — where it is screenshot, forwarded, and stored on servers you do not control. It must therefore not carry a credential that also opens `/orders` (which returns buyer email addresses), `/admin/test`, or `/billing-selftest`.

So each queued ad gets its own random token, stored on its row:

- It authorises **one ad** and nothing else.
- It is **burned on decision** — cleared from the row — so a link that surfaces later from a forward or a chat backup is inert even before the status check would catch it.
- A wrong token and a nonexistent ad both return `404`, so the endpoint cannot be used to discover which ad ids exist.

`ADMIN_KEY` is still what authorises *creating* a queue row (`POST /api/ad/register`), but that call is machine-to-machine with the key in a header.

`/flash-deal/approve` now works the same way: each paid flash deal gets its own
token, minted with its row and burned on approval. A wrong token, an unknown
id and an already-decided deal are all `404` — indistinguishable on purpose,
since anything else turns the endpoint into a way to discover which deals
exist. The cost is that a second tap reads "not found" rather than "already
approved"; the first tap already reported the outcome.

> `/restock/approve` and `/submit/approve` still put `ADMIN_KEY` in a URL that
> travels through Telegram. They are the same change and have not been made yet.

Every ad carries **`РЕКЛАМА · SPONSORED`** at the top of the image. The app tells shoppers "paid placements are always labelled", and an ad that quietly drops the mark to perform better would break that promise.

## 💬 Telegram bot

**[@Secondhandlvivbot](https://t.me/Secondhandlvivbot)** — the app's companion. Every result links back into the map, so a shopper can go from a Telegram message to directions in two taps. The interface is Ukrainian.

**Tap-through menu.** `/start` attaches a persistent reply-keyboard, so the common paths need no typed commands at all: 📅 by weekday (opens a day submenu), 💰 cheapest now, 🐢 rarely restocked, ➕ add a store, 💬 leave feedback, ❓ help. Each button just sends its own label back as ordinary text, which keeps the whole menu in the stateless tier — no bot token required to answer it.

> Telegram never pushes a changed keyboard into an existing chat on its own; it only updates when the bot sends a message carrying one. After a menu change, send `/start` to see it.

**Two deep links the app hands out** (not typed commands): `?start=rsub_<storeId>` follows a store for **restock** alerts — the fallback the app offers wherever browser push is unavailable, which is most iPhones — and `?start=sub_<storeId>` follows it for paid **flash deals**. The bot computes the restock prediction itself from the chain's published calendar, then a dated restock, then a bare weekday; daily-drop stores decline politely, since they have no cycle to predict.

**Anyone can use:**

| Command | What it does |
| --- | --- |
| `/today` | Stores getting new stock today |
| `/day` | Pick any weekday and see what restocks then |
| `/rare` | Stores that restock rarely — worth a special trip |
| `/cheap` | Which stores have gone longest since a restock |
| `/submit` | Submit your own store (for shop owners) |
| `/materials` | Printable flyers, posters and QR stickers |
| `/apply` | Apply to become a field agent |
| `/feedback` | Send the maintainer a note about the bot or the map |
| `/leaderboard` | Top 10 community contributors by points |
| `/stop` | Unsubscribe from everything — restock alerts *and* flash-deal alerts |
| `/help` | Command list and info |

**Field agent & owner only** — these appear in the menu only for authorised Telegram IDs, and are refused for anyone else. For those users the reply-keyboard also grows a row: **🧭 Agent menu** (agents and the owner) and **⚙️ Admin menu** (owner only), which are just one-tap aliases for `/agent` and `/admin` and go through the same authorization checks.

| Command | What it does |
| --- | --- |
| `/agent` | The agent menu — everything below, as tappable buttons |
| `/visit` | Log a store visit — GPS, storefront photo, questionnaire |
| `/route` | Opens a map (Telegram Mini App) of every available store — pick up to 12, submit, and they're claimed for you for 12 hours |
| `/poster` | Log a poster placed in a public space (bus stop, university) |
| `/expense` | Log a material expense with a photo receipt |
| `/myvisits` | Your own logged visits and earnings |
| `/pay` | The live pay scheme, from the configured rates |
| `/card` | Your payout card |
| `/job` | The full job description |
| `/cancel` | Abandon a half-finished `/visit` |
| `/admin` | Owner only — the admin menu (report, visitors, export, agents) |
| `/report` · `/export` | Owner only — totals, estimated pay, CSV export |

The command menu is **self-managing**: the bot pushes its own command list to Telegram on startup, so there is no BotFather `/setcommands` step. Bump `CMD_VER` in `telegram-bot/worker.js` after editing the lists to force a re-sync. The version is recorded **only when Telegram accepts the menu**, so a rejected push retries instead of marking itself done and going stale forever.

> The bot also carries the money side: a Telegram message arrives the moment any promotion or à la carte order is paid.

## 🎒 Field agent handbook

Surveying ~130 stores and keeping their restock schedules accurate is fieldwork, so the project employs a local agent. The complete handbook — bilingual, and the document the agent actually works from — is **[`docs/FIELD_AGENT.md`](docs/FIELD_AGENT.md)**.

**Pay** — ₴80 per verified visit, plus ₴200 per verifiable result (QR poster placed, or store owner signed up; both can apply to one visit), ₴10 per public-space poster (capped 10/agent/day), and material expenses reimbursed up to ₴300 with a photo receipt. Suggested pace 8–12 stores/day. Paid weekly against `/report` and `/export`.

**Bonus vs. commission** — a **bonus** pays for the *action* (poster placed, lead captured) even if that store never buys. A **sales commission** pays only when a store actually subscribes and pays. The bonus rewards pipeline; the commission rewards revenue.

**What counts as a visit** — GPS reading, clear storefront photo, and every question answered. Incomplete submissions don't count, the bot records distance from the store's map pin so far-off visits get flagged, and re-visiting the same store in one survey cycle doesn't earn a second base.

**Updating the map** — restock days, hours, names, addresses and notes are edited **in the app**, then submitted via 🤝 → 🗺️ Add to the official map, which reaches the maintainer on Telegram (no GitHub account required). Photos, chat and live location go through Telegram, which the app can't do.

**Phase 2** — once pricing is validated, the agent also sells promotions and earns a one-time commission per signed store. Not active yet.

## 🔒 Privacy

No accounts, no ad networks, no personal tracking. Local stores can pay for a clearly-labelled placement on the map, sold directly by us — there is no ad network involved and nothing about you is used to choose what you see. Browsing, adding, and editing stores all stay in your own browser on your own device — none of it is ever sent to a server unless you choose to share it. The only things measured are anonymous, aggregate traffic (page views and visits) via **Cloudflare Web Analytics** and anonymous in-app usage (which stores/filters get used) via a small first-party service on Cloudflare — both cookieless, with no personal data and no individual-visitor or cross-site tracking.

The exception is the **Telegram-based features** (flash-deal alerts, field-scout corrections, community edit suggestions) — these are opt-in and inherently involve Telegram: your chat id is stored so a subscription or a contribution has somewhere to go, alongside a display name and points total if you submit an edit. None of it is linked to your browsing on the map, and none of it is shared beyond what running the feature requires. Full details: **[Privacy Policy](https://www.lvivsecondhand.com/privacy.html)** (also linked from the in-app **?** Help panel)

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
- 🆕 **Магазини з щоденним оновленням** — крамниці, які завозять товар щодня й міняють колекцію лише сезонно, позначені окремо, а не втиснуті в лічильник циклу
- ⚖️ Підтримка магазинів **на кіло** та **поштучно**
- 🌐 Перемикач мови **EN / UA**
- ✅ Позначення магазинів як **відвіданих**
- 🔔 **Сповіщення про завезення** — стежте за магазином і дізнавайтеся про завіз того ж ранку. Через push там, де браузер це вміє; де не вміє (iOS без встановленого застосунку) та сама кнопка пропонує Telegram, тож сповіщення доступні на будь-якому пристрої
- 📸 **Instagram** — [@secondhandlvivbot](https://www.instagram.com/secondhandlvivbot/): хто найдовше без завозу, автоматично щопонеділка
- ➕ **Додавання**, ✏️ **редагування** та 🗑️ **видалення/приховування** магазинів
- 🤝 **Поділитися картою** та **внести** доповнення/зміни для всіх
- 🔗 **Посилання на магазин** — скопіюйте пряме посилання `?store=<id>`, що одразу відкриває цей магазин
- 💬 **Телеграм-бот** — [@Secondhandlvivbot](https://t.me/Secondhandlvivbot): меню кнопками, а також `/today`, `/day` (будь-який день тижня), `/rare` і `/cheap`
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
| 🟣 Фіолетова | `#6b3fa0` | **Оновлення щодня** — циклу немає, будь-який день вдалий |
| 🟨 Золота | `#ffd23f` | **Платне розміщення**, завжди позначене як реклама |

Зелений → бурштиновий → червоний — це одна шкала, а не три категорії: той самий шлях показують шкала знижок і сторінка магазину, з тих самих значень (`--phase-*` у `:root`, віддзеркалені в `PIN_COLORS`). Змінюється в одному місці.

**Фіолетовий навмисно поза цією шкалою.** Деякі крамниці викладають новий товар щодня й міняють повну колекцію лише сезонно — у них просто немає місця в циклі, щоб бути раннім чи пізнім. Синій читався б як «ми ще не знаємо», хоча насправді все навпаки, тож вони мають власний колір і взагалі не показують лічильник днів (`dailyDrop` у даних).

**Напис — мережа, якщо вона є**

Літера всередині позначки — це **мережа**, щоб знайому марку було видно, нічого не відкриваючи. Незалежні магазини поза мережами літери не мають: літера має сенс лише тоді, коли в мережі більше однієї позначки.

| Напис | Значення |
| --- | --- |
| `H` | HUMANA |
| `C` | Світ секонд-хенду |
| `E` | EconomClass |
| `Є` | Євро Тренд |
| `B` | ЄвроБренд |
| `S` | Сток та секонд хенд |
| `M` | МЮНХЕН |
| `L` | Birka! Lux |
| *(немає)* | Незалежний — не входить до мереж на карті |
| `+` | Доданий вами |
| `✓` | **Ви позначили його відвіданим** (замінює літеру; колір лишається) |
| ⭐ | Featured — платне розміщення |
| 🌟 | Spotlight — найвищий платний тариф |

`B`, `S`, `M` і `L` навмисно не збігаються з першими літерами назв своїх мереж: кирилична `С` і `Є` вже зайняті під Світ і Євро Тренд, тож схожа літера була б гіршою за окремий, чітко відмінний знак. Список — у `BRAND_LABEL` (`index.html`).

**Розмір, обідок і порядок** — звичайні позначки 36px з білим обідком. Платні — 44px (Featured) і 50px (Spotlight), вони вище за всіх і мають **темний обідок замість білого**, щоб золотий ніколи не доводилося відрізняти від бурштинового лише за кольором. Розмір купують, а не заслуговують.

**Три наслідки, які варто знати:**

- **Синій означає, що ми справді ще не знаємо.** Місце в циклі визначається за чіткою послідовністю пріоритетів — перше, що знайдено, те й діє: **дата завезення, яку ви записали на цьому пристрої** (це спостереження і найсвіжіше, що ми маємо саме для вас) → **опублікований календар** дат завезення (`restockDates` — він називає кожне завезення, а не одне, тож лишається точним навіть за нерівних проміжків) → **дата завезення, яку вніс інший відвідувач** (`restock_date`) → **опублікований день тижня** завезення (`restockDay` — спільні дані, які працюють для кожного, у кого нічого не збережено, але лише для тижневого циклу, де сам день однозначно визначає позицію). Магазини, у яких немає жодного з цих джерел, — сині. Тож синій показує, де візит польового агента вартий найбільше, і стає кольором назавжди, щойно з’явиться будь-яке спільне джерело. Магазини з щоденним оновленням до цього не належать взагалі — вони фіолетові незалежно ні від чого.
- **Відвідано замінює літеру, а не колір.** Відвіданий магазин зберігає колір циклу й показує `✓` — ви не втрачаєте сигнал про час.
- **Просунута позначка ніколи не показує ані `✓`, ані колір циклу.** Золотий і зірка мають пріоритет над обома, тож на платній позначці карта не скаже ні того, ні іншого. Сторінка самого магазину — скаже.

**Verified+ навмисно нічого тут не змінює.** Він купує значок на картці, а не позначку на карті — саме це тримає карту чесною, а два рекламні тарифи — вартими своєї ціни.

**Фільтр «🎉 Свіжий сьогодні».** Показує лише магазини, які зараз на дні 0 — щойно завезли, чи то за записаною датою поставки, чи за опублікованим графіком завезення. На карті цей фільтр також малює пропонований маршрут: лінію найближчого сусіда між свіжими магазинами (починаючи з «Поруч», якщо його встановлено), а кожна позначка отримує відповідний номер. Це не пошук найкоротшого шляху, а швидка й однозначна підказка для кількох магазинів, що завезли товар сьогодні.

## 🤝 Обмін і внесок

Магазини, які ви додаєте чи редагуєте, зберігаються лише на вашому пристрої. Кнопка **🤝** (праворуч зверху) — це те, як вони його полишають:

- **🗺️ Додати до офіційної карти** — надсилає ваші доповнення та виправлення супровіднику на перевірку. **Акаунт GitHub не потрібен.** Застосунок надсилає їх на метрик-воркер, супровідник отримує ✅/❌ у Telegram, і лише схвалення створює звернення на GitHub (на боці сервера, через API).
- **🏪 Власник магазину?** і **🔑 Це мій магазин** — власник додає свою крамницю або заявляє права на ту, що вже є на карті. Обидва шляхи проходять те саме схвалення в Telegram. Схвалення *заявки* створює 4-значний PIN магазину, який дозволяє купленій власником спалах-знижці опублікуватися одразу, не чекаючи перевірки.
- **🛟 Резервна копія та відновлення** — повний знімок усього, що зберігає цей пристрій (відвідування, дати завезення, додані магазини, правки, підписки), у файлі, який лишається у вас. Відновлення повертає все назад.
- **✏️ Редагувати магазин → ↺ Скинути до офіційних даних** — прибирає ваші локальні правки для цього магазину, якщо їх уже замінило новіше офіційне виправлення. Інакше застаріла правка тихо надсилалася б знову з кожним наступним внеском.

> Обмін між користувачами (посилання, короткі коди та імпорт чужої карти) прибрано: тепер усе проходить одним перевіреним шляхом, тож у спільної карти один вхід і одне місце, де перевіряють якість.

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

**🔔 Стежте за спалах-знижками магазину в Telegram** — натисніть посилання на сторінці будь-якого магазину, щоб відкрити [@Secondhandlvivbot](https://t.me/Secondhandlvivbot) і підписатися (`/stop`, щоб відписатися від усього). Це окремо від сповіщень про завезення 🔔 вище — тут повідомлення надходить лише для платної знижки «+ сповіщення в Telegram», а не для звичайного завозу. Обидва тепер доступні в Telegram: завіз — `rsub_<id>`, знижки — `sub_<id>`, а `/stop` вимикає одразу обидва.

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
- **Польовий агент** — єдина суттєва змінна витрата: ₴80 за перевірений візит, бонуси ₴200, а також менші компенсації за публічні плакати й матеріали (див. довідник нижче).

**Чому це працює.** Маржа програмного продукту дуже висока, а інфраструктура не дорожчає з кількістю користувачів, тож усе тримається на вартості залучення. Залучити магазин на Featured коштує приблизно 2–3 візити плюс комісія (≈₴500–750); за ₴600/місяць це окупається приблизно за місяць, а далі — майже чиста маржа.

**Чому магазин платить.** Покупці вже на карті й шукають саме те, що продає цей магазин, а рядок з пропозицією (`-10% із застосунком`) робить віддачу вимірюваною — магазин може рахувати, хто його згадав.

**Де це зараз.** Шлях оплати працює повністю й виконується автоматично. Власник закриває перші угоди вручну, щоб перевірити ціни, перш ніж продажем займеться агент. Повний прайс і план: **[`docs/ADVERTISING.md`](docs/ADVERTISING.md)** (англійською).

## 📸 Instagram

[@secondhandlvivbot](https://www.instagram.com/secondhandlvivbot/) — ті самі дані, що й на карті, лише у формі, яку гортають у телефоні.

**Щотижневий пост із цінами — автоматичний.** `.github/workflows/deals-image.yml` щопонеділка перебудовує `marketing/deals-this-week.jpg` за тим самим рейтингом `/cheap`, що й бот, комітить його (далі GitHub Pages віддає його за сталою адресою) і викликає `instagram-post.yml`, щоб опублікувати з підписом, згенерованим із рейтингу саме цього тижня. Публікується лише тоді, коли рейтинг **змінився**.

Решта — вручну: **Actions → Post to Instagram → Run workflow**. Позначка **`dry_run`** проганяє перевірки й зупиняється перед публікацією — зручно після зміни секрета, щоб перевірка налаштувань не коштувала справжнього допису.

Налаштування — у **[`docs/INSTAGRAM.md`](docs/INSTAGRAM.md)**. Два підводні камені: використовується шлях **Instagram Login** (`graph.instagram.com`), а не Facebook Login — вони несумісні, і більшість інструкцій в інтернеті описують саме інший; і **токен діє 60 днів**, а дізнатися залишок цим шляхом неможливо, тому щотижневий `instagram-token-check.yml` пише власнику в Telegram, щойно токен перестає працювати.

Зображення мають бути у форматі **JPEG** — PNG API відхиляє.

## 💬 Телеграм-бот

**[@Secondhandlvivbot](https://t.me/Secondhandlvivbot)** — супутник застосунку. Кожен результат посилається назад на карту, тож від повідомлення в Telegram до маршруту — два дотики. Інтерфейс українською.

**Меню кнопками.** `/start` додає постійну клавіатуру, тож для найчастіших дій не треба вводити команди взагалі: 📅 за днем тижня (відкриває підменю днів), 💰 найдешевше зараз, 🐢 рідко оновлюють, ➕ додати магазин, 💬 залишити відгук, ❓ довідка. Кожна кнопка просто надсилає свій підпис як звичайний текст — тому все меню лишається в тому ж рівні без стану, для відповіді не потрібен токен бота.

> Telegram ніколи не оновлює клавіатуру в наявному чаті сам — вона змінюється лише тоді, коли бот надішле повідомлення з новою. Після зміни меню надішліть `/start`, щоб побачити його.

**Доступно всім:**

| Команда | Що робить |
| --- | --- |
| `/today` | Магазини із завезенням сьогодні |
| `/day` | Обрати будь-який день тижня і побачити, що завозять тоді |
| `/rare` | Магазини, які оновлюються рідко — варті окремої поїздки |
| `/cheap` | Хто найдовше без завозу |
| `/submit` | Додати свій магазин (для власників) |
| `/materials` | Матеріали для друку: флаєри, постери, QR-наліпки |
| `/apply` | Податися в польові агенти |
| `/feedback` | Надіслати власнику відгук про бота чи карту |
| `/leaderboard` | Топ-10 учасників спільноти за балами |
| `/stop` | Відписатися від усіх сповіщень про спалах-знижки |
| `/help` | Команди та інформація |

**Лише для агента та власника** — зʼявляються в меню тільки для дозволених Telegram ID, іншим відмовлено. Для них клавіатура також отримує додатковий рядок: **🧭 Меню агента** (агенти й власник) і **⚙️ Адмін-меню** (лише власник) — це просто кнопки-синоніми до `/agent` та `/admin` із тими самими перевірками доступу.

| Команда | Що робить |
| --- | --- |
| `/agent` | Меню агента — усе нижче у вигляді кнопок |
| `/visit` | Записати візит: GPS, фото вітрини, анкета |
| `/route` | Відкриває карту (Telegram Mini App) вільних магазинів — оберіть до 12, надішліть, і вони закріпляться за вами на 12 годин |
| `/poster` | Записати плакат у публічному місці (зупинка, ВНЗ) |
| `/expense` | Записати витрату на матеріали з фото-чеком |
| `/myvisits` | Ваші записані візити та заробіток |
| `/pay` | Актуальна схема оплати з налаштованих ставок |
| `/card` | Ваша картка для виплат |
| `/job` | Повний опис вакансії |
| `/cancel` | Скасувати незавершений `/visit` |
| `/admin` | Лише власник — адмін-меню (звіт, відвідувачі, експорт, агенти) |
| `/report` · `/export` | Лише власник — підсумки, оплата, експорт CSV |

Список команд **керує собою сам**: бот надсилає його у Telegram під час запуску, тож крок `/setcommands` у BotFather не потрібен. Після редагування списків змініть `CMD_VER` у `telegram-bot/worker.js`, щоб примусити пересинхронізацію. Версія записується **лише тоді, коли Telegram прийняв меню**, тож відхилена спроба повторюється, а не позначає себе виконаною й не застрягає назавжди.

> Бот також відповідає за гроші: повідомлення приходить щойно оплачено будь-яке просування чи додаткову послугу.

## 🎒 Довідник польового агента

Обстежити ~130 магазинів і підтримувати графіки завезення актуальними — це польова робота, тож у проєкті працює місцевий агент. Повний довідник — двомовний, саме той, з якого працює агент — **[`docs/FIELD_AGENT.md`](docs/FIELD_AGENT.md)**.

**Оплата** — ₴80 за перевірений візит плюс ₴200 за кожен підтверджений результат (розміщено QR-постер або власник зареєструвався; обидва можуть бути в одному візиті), ₴10 за плакат у публічному місці (макс. 10/агент/день) та компенсація матеріалів до ₴300 за фото-чеком. Орієнтир — 8–12 магазинів на день. Виплати щотижня за `/report` і `/export`.

**Бонус чи комісія** — **бонус** платиться за *дію* (постер розміщено, лід зібрано), навіть якщо магазин ніколи не купить. **Комісія з продажу** платиться лише коли магазин справді підписався й заплатив. Бонус винагороджує воронку, комісія — дохід.

**Що вважається візитом** — показник GPS, чітке фото вітрини та відповіді на всі питання. Неповні подання не зараховуються, бот фіксує відстань від позначки магазину на карті, тож віддалені візити позначаються для перевірки, а повторний візит до того ж магазину в одному циклі не дає другої бази.

**Оновлення карти** — дні завезення, години, назви, адреси й нотатки редагуються **в застосунку**, а потім надсилаються через 🤝 → 🗺️ Додати до офіційної карти, що потрапляє до супровідника в Telegram (акаунт GitHub не потрібен). Фото, спілкування та геолокація в реальному часі — через Telegram, чого застосунок не вміє.

**Фаза 2** — коли ціни підтвердяться, агент також продаватиме просування й отримуватиме разову комісію за кожен підписаний магазин. Ще не активна.

## 🔒 Конфіденційність

Без облікових записів, рекламних мереж і персонального стеження. Місцеві магазини можуть оплатити чітко позначене розміщення на карті — його продаємо безпосередньо ми, без рекламних мереж, і для вибору того, що ви бачите, не використовується жодна інформація про вас. Перегляд карти, додавання й редагування магазинів залишаються у вашому браузері на вашому пристрої — нічого з цього не надсилається на сервер, доки ви самі не вирішите поділитися. Єдине, що вимірюється, — це анонімний, узагальнений трафік (перегляди та відвідування) через **Cloudflare Web Analytics** та анонімне використання додатка (які магазини/фільтри застосовують) через невеликий власний сервіс на Cloudflare — обидва без файлів cookie, без персональних даних і без відстеження окремих відвідувачів чи міжсайтового стеження.

Виняток — **функції на основі Telegram** (сповіщення про спалах-знижки, правки польового агента, спільнотні пропозиції змін): вони добровільні (opt-in) і за своєю суттю повʼязані з Telegram — ваш chat id зберігається, щоб було куди надсилати підписку чи внесок, а також імʼя для показу й кількість балів, якщо ви пропонуєте правку. Ніщо з цього не повʼязується з вашою активністю на карті й не передається понад те, що потрібно для роботи функції. Докладніше: **[Політика конфіденційності](https://www.lvivsecondhand.com/privacy.html)** (також доступна з панелі довідки **?** у застосунку) — *примітка: сам документ політики ще оновлюється відповідно до цього; до того часу вважайте цей README актуальнішим джерелом.*
