# Advertising & store promotions

How stores pay to be promoted in Lviv Second Hand, what each tier does, how to
fulfil a sale, and the unit economics behind it. This is the owner-facing pricing
& operations doc; the agent-facing process is in [FIELD_AGENT.md](FIELD_AGENT.md).

> **Status.** The promotion *system* is built (PR: in-app promotions). Selling is
> **owner-run first** — you close a few deals by hand to validate pricing, then the
> field agent takes over selling (Phase 2 in FIELD_AGENT.md). All numbers below are
> **starting proposals** — tune them after the pilot.

---

## 1. What a store is buying

A promotion makes a store stand out across every surface, all clearly labelled as
advertising:

- **Map** — a gold ⭐ pin, larger, floating above the other pins.
- **List** — floated to the top of the current view, gold border, `⭐ Sponsored /
  Реклама` badge, and a one-line offer.
- **Store page** — a gold promo card with the offer and a "featured until" date.
- **Telegram bot** — a labelled sponsored slot atop `/today` and `/cheap`.
- **Weekly deals image** — a labelled sponsored card at the top.

Everything auto-expires on the `until` date, so a lapsed store silently reverts to a
normal free listing.

## 2. Rate card (proposed — ₴ UAH / month)

Second-hand stores are small; keep entry cheap and prove ROI before upselling.

| Tier | ₴/mo | What it includes |
|---|---|---|
| **Basic** | Free | On the map with hours, pricing, and the restock tracker (already). |
| **Verified+** | ₴250 | Enhanced page: photos, phone, confirmed hours, a "verified" badge, one promo/offer line. |
| **Featured** | ₴600 | Verified+ **plus** the gold pin, top-of-list placement in its area, and the ⭐ badge. |
| **Spotlight** | ₴1,200 | Featured **plus** deal-of-the-week rotation, the sponsored line in the Telegram bot, and a homepage banner slot. |
| **À la carte** | — | Deal-of-week slot **₴300/week** · poster placement + refresh **₴150** one-time · sponsored push (later) **₴400**. |

- **Annual prepay:** 2 months free (pay for 10).
- **Intro offer for the pilot:** first month of Featured at ₴300 (half) or a free
  2-week trial, to lower the barrier and gather testimonials.

## 3. How to fulfil a sale (owner, ~5 min)

Add a `promo` object to that store's entry in `index.html`'s `STORES` array, then
ship it the usual way (bump `APP_VERSION`, commit, deploy). No new code needed.

```js
// inside the store's object in STORES:
promo: { tier:'featured', offer:'-10% з застосунком', until:'2026-09-30' },
```

- `tier`: `'featured'` or `'spotlight'` (label/among-surfaces intent).
- `offer`: the short line shown to shoppers (bilingual is fine). Omit for a plain
  featured placement.
- `until`: `YYYY-MM-DD`; the promotion disappears by itself after this date.

To also surface it in the **Telegram bot** and **deals image**, rebuild the bot
dataset (`node telegram-bot/build-data.mjs`) and redeploy the worker / re-run the
deals image — both read `promo` through automatically.

For **Verified+** (no featured placement), just fill the store's real fields
(photos/phone/hours/note) and, if they bought an offer line, add a `promo` with only
an `offer` (no gold pin unless `tier` is set — use `tier` only for Featured/Spotlight).

## 4. Unit economics (internal)

- **Infra:** ~₴0 — Cloudflare + GitHub Pages free tiers.
- **Payments:** card via **LiqPay** (PrivatBank) ≈ **1.5%** per successful charge,
  settled in ₴ to the ФОП account (confirm the current tariff). On a ₴600 Featured
  that's ≈ ₴9 — immaterial against the margin. Bank transfer against an invoice
  (the bot's `/invoice`) costs nothing.
- **Fulfilment:** ~5 min owner time per sale (hand-edit `promo` + deploy).
- **Agent cost now (Phase 1):** ₴80/verified visit + poster/sign-up bonuses.
- **Agent cost when selling (Phase 2):** a **one-time sales commission per signed
  store**, paid only once the store subscribes and pays (proposed ₴300–₴500 Featured,
  ₴800 Spotlight). No recurring trailer. *(Distinct from the Phase-1 **bonus**, which
  rewards a poster/lead regardless of a sale.)*
- **Margin:** software — very high. The only real variable cost is agent commission.

**CAC vs LTV (example, Featured):**
- Acquire ≈ 2–3 visits (₴160–₴240) + ₴300–₴500 commission ≈ **₴500–₴750 CAC**.
- LTV ≈ ₴600/mo × ~6 months retention ≈ **₴3,600**. Ratio ≈ 5–7× — healthy.

**Break-even (example):** if the agent's weekly base ≈ ₴3,000 (~40 visits), about
**5 Featured subscriptions** (₴600) cover the agent; every additional subscription is
near-pure margin minus its one-time commission.

**Rule of thumb:** a Featured store pays for its own acquisition in ~1 month and is
profit thereafter; churn is the number to watch, not price.

## 5. Why a store pays — ROI proof (make-or-break)

Small stores buy foot traffic, not "impressions." Give them tangible proof:

- **Reach numbers.** Requires analytics live — **Cloudflare Web Analytics is still
  pending** on the owner's side. Until then, sell on foot-traffic + novelty +
  "be first on the map before your competitors."
- **Attribution.** A store-specific offer line ("-10% з застосунком") plus a "did you
  find us on the app?" prompt at the till makes redemptions countable.
- **Monthly mini-report.** The app already tracks `store_open` (page opens / deep-link
  taps); package a simple monthly "your store on the app" summary per paying store.

## 6. Billing, cadence & compliance

- **Cadence:** monthly or annual. Card subscriptions renew through LiqPay; an
  invoiced plan does not renew by itself — send a new `/invoice` before `until`.
- **Collection:** **LiqPay** card checkout (see §7) once the shop is activated, and
  bank transfer against an invoice (`/invoice`, `/paid`) at any time. Stripe is no
  longer used — see [STRIPE_RETIREMENT.md](STRIPE_RETIREMENT.md).
- **Tax/FOP:** the owner is now registered as a ФОП. The plan for using it —
  local acquiring in ₴, invoices, fiscal receipts — is in
  [FOP.md](FOP.md) (this is not legal advice).
- **Ad labelling:** every paid placement is marked `Реклама / Sponsored`; keep
  featured density low (≈1 sponsored per screen/area) so the map stays trusted.
- **Editorial content is not a free tier.** The app also shows HUMANA's daily
  prices, read off the chain's own public channel (see
  [CHAIN_PRICES.md](CHAIN_PRICES.md)). Nobody paid for that and nobody can: it is
  a neutral card with a source link, deliberately styled *unlike* every paid
  surface — no gold pin, no ⭐ badge, no change to map position or list order. If
  a store asks to buy the same thing, what they are buying is a tier above, not
  that card. Letting the two look alike would tell shoppers the gold styling
  means nothing and tell stores the rate card is optional.

## 7. Payments: LiqPay and invoices

Every sale goes through one of two routes, and both end in the same fulfilment code
in `worker/worker.js` (`claimPayment()` → `fulfil()`): the placement goes live, the
owner gets a Telegram ping, and an Instagram ad is queued when there is an offer line.

1. **Card, in the app — LiqPay (PrivatBank).** `GET /promote`, `/flash-deal` and
   `/order` prepare the payment and show the payer a confirmation page (price, the
   text that will be published, the receipt email), which posts the signed form to
   LiqPay. LiqPay's signed callback (`POST /liqpay-callback`) delivers it. Monthly
   and annual plans are LiqPay subscriptions. Off until `PAY_PROVIDER=liqpay` and
   the LiqPay keys are set; on sandbox keys nothing is ever published and the app
   hides the buttons. Details and switching on: [FOP.md](FOP.md) §3.
2. **Bank transfer — invoices.** In the bot (owner only): `/invoice <store> <plan>
   [buyer]` issues a printable рахунок with the IBAN and payment purpose;
   `/paid <number>` marks it paid and publishes the placement; the акт is available
   once paid. See [FOP.md](FOP.md) §5.

**Stripe is no longer used** for new sales. The Stripe account stays (it is shared
with another product), its webhook still answers, and the old Payment Links are
still live at Stripe but no longer offered anywhere; a hryvnia payment through one
pings the owner because nothing is delivered for it. See
[STRIPE_RETIREMENT.md](STRIPE_RETIREMENT.md).

- **Intro offer** (first month Featured at ₴300) was a Stripe coupon (`FEATURED50`).
  LiqPay has no promotion codes; honour it with a ₴300 invoice, or withdraw it.

### Ad-hoc (one-off) purchases

The promote sheet has a third tab, **One-off**, for stores that want a burst around a
sale week and no subscription. Two things live there, and they behave differently.

**Short paid runs — self-fulfilling.** Pay once; the placement runs to the end of the
Nth day after the day of payment (Kyiv time) and stops. Nothing recurs, nothing to
cancel.

| Tier | 1 day | 7 days | 30 days |
|---|---|---|---|
| Verified+ | ₴50 | ₴100 | ₴250 |
| Featured | ₴100 | ₴200 | ₴600 |
| Spotlight | ₴200 | ₴400 | ₴1,200 |

A 30-day run costs the same as one month of the subscription — the subscription's
advantage is that it keeps running, not that it is cheaper. A 7-day run is a third of
the month.

`/promote?…&cadence=run1|run7|run30` charges the amount in `PROMO_RUNS`
(`worker/worker.js`) as a one-off payment. Fulfilment sets `until = today + days` and
stores no `sub_id`, so no renewal can ever extend a run.

**À la carte extras — owner-fulfilled.** Deal of the week ₴300, poster placement ₴150,
sponsored push ₴400 (`ORDER_ITEMS` in `worker/worker.js`).

> These are **orders, not placements.** The app has nothing to render them into — the
> poster is physical, deal-of-week has no in-app surface, sponsored push is not built —
> so buying one changes nothing on the map. `/order?store=&item=` records the purchase
> and the buyer's email in the `orders` table and the app says you will be in touch.
> **You have to actually deliver them**, so check the queue.

**Reading the order queue:**

```
curl -H "X-Admin-Key: $ADMIN_KEY" https://lviv-metrics.lshanalytic.workers.dev/orders
```

Returns the last 200 orders (store, item, amount, buyer email, optional note, status).
It is gated on `ADMIN_KEY` because it carries buyer emails — never expose it publicly.

**You also get a Telegram ping the moment either kind of sale lands**, so the queue is
a ledger rather than something you have to remember to poll:

```
🧾 NEW ORDER — you need to fulfil this     💸 PROMOTION PAID — already live, nothing to do
Item:  Poster placement                    Store: s2
Store: h1                                  Plan:  featured · 7-day run
Paid:  ₴150                                Paid:  ₴200
Email: shop@example.com                    Offer: -10% із застосунком
Note:  -20% цей тиждень                    Until: 2026-08-14
```

Each message ends with a deep link to the store. The wording is deliberately different:
an order is a task, a promotion is already fulfilled and just tells you money arrived.

This needs the metrics Worker to have the **`BOT_TOKEN`** secret (the same repo secret
the bot Worker already uses — `deploy-worker.yml` pushes it) and the `OWNER_ID` var in
`worker/wrangler.toml`. Without the token it silently does nothing and `/orders` is the
only record. The ping is sent through `ctx.waitUntil`, so a slow or failed Telegram call
can never delay or fail the payment callback, and messages carry **no `parse_mode`** —
buyer-supplied text cannot be made to render as markup.

### Self-service purchase (in-app)

A store owner does not need to be contacted first. In the app: open the store →
bottom of the store page → **📣 Own this store? Promote it** → a sheet showing the
full rate card. They pick monthly/annual, pick a tier, optionally type the offer
line shoppers will see and an email, and pay. The CTA only appears when `/status`
reports `promoConfigured: true` (LiqPay on live keys), so it can never lead to a dead
checkout.

The sheet's prices are **display-only** — what is actually charged comes from
`PROMO_AMOUNTS`, `PROMO_RUNS`, `FLASH_DEAL_TIERS` and `ORDER_ITEMS` in
`worker/worker.js`. `scripts/check-payments.mjs` fails CI if the two disagree.

**Offer line.** Typed by whoever pays, capped at 48 chars, angle brackets stripped
and whitespace collapsed in the Worker (`cleanOffer`) on the way in *and* again at
fulfilment, then escaped on render. The payer sees it on the confirmation page before
paying. Leave it blank and the card simply omits it.

**Cancelling a subscription.** By email to hello@lvivsecondhand.com (offer §8.1);
the owner cancels the order in the LiqPay dashboard. The placement keeps the time
already paid for.

> **Known limitation — no ownership check.** Anyone can promote any store, and the
> offer line is free text. Paying for a store you do not own is self-punishing, but
> the offer text is the abuse surface: it is length-capped, stripped and escaped, and
> the promo is one `UPDATE promos SET status='canceled'` away from removal. Revisit
> if it is ever actually abused; do not add friction before then.

### What each tier actually renders

The app enforces the rate card, so the tiers are visibly different — a store that
pays more gets more, and Verified+ never quietly buys a placement.

| | Verified+ | Featured | Spotlight |
|---|---|---|---|
| Badge on card | ✓ Verified · Sponsored (green) | ⭐ Sponsored (gold) | 🌟 Spotlight · Sponsored |
| Offer line | ✓ | ✓ | ✓ |
| List position | **unchanged** | boosted | boosted, above Featured |
| Map pin | **unchanged** | gold ⭐, 44px | gold 🌟, 50px, above all |

Verified+ is a trust badge, not an ad placement: it changes no ranking and no pin,
which is what keeps the map honest and keeps the two ad tiers worth their price. It
is still paid, so it carries the advertising label like every paid placement. A
legacy promo with no `tier` is treated as Featured.

## 8. Rollout sequence

1. **Now:** system built; owner sells 3–5 Featured/Verified+ by hand at the intro
   price; fulfil via §3; gather testimonials + real redemption data.
2. **Validate:** lock the real prices from what stores actually pay.
3. **Phase 2:** hand selling to the agent with the one-time-bonus scheme and the
   bilingual sell-sheet; add analytics-backed ROI reports.
