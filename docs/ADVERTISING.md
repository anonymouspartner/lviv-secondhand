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
- **Payments:** card via **Stripe** ≈ **2.9% + a small fixed fee** per successful
  charge (confirm your country's exact rate). On a ₴600 Featured that's ≈ ₴17 +
  fixed — immaterial against the margin. Bank transfer / cash stays available at ₴0
  fee where a store prefers it.
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

- **Cadence:** monthly or annual prepay; set a reminder to renew/extend `until`
  before it lapses. Stripe handles recurring billing and renewal reminders for you.
- **Collection:** **Stripe** is the primary processor (see §7); cash or bank transfer
  (₴0 fee) stays available as a fallback for stores that prefer it.
- **Tax/FOP:** ad revenue in Ukraine may need FOP registration / tax handling, and
  Stripe onboarding depends on an eligible business entity/country — the owner's call
  (this is not legal advice).
- **Ad labelling:** every paid placement is marked `Реклама / Sponsored`; keep
  featured density low (≈1 sponsored per screen/area) so the map stays trusted.

## 7. Stripe: payments & product scheme

Payments into the app are processed through **Stripe**. The rate card in §2 maps
one-to-one onto Stripe **Products** (the tier) and **Prices** (the amount + billing
interval):

| Tier | Stripe Product | Price(s) |
|---|---|---|
| **Verified+** | `Verified+` | ₴250 / month · ₴2,500 / year (10× — 2 months free) |
| **Featured** | `Featured` | ₴600 / month · ₴6,000 / year |
| **Spotlight** | `Spotlight` | ₴1,200 / month · ₴12,000 / year |
| **À la carte** | `Deal of the week` / `Poster placement` / `Sponsored push` | one-time ₴300 / ₴150 / ₴400 |

- **Intro offer** (first month Featured at ₴300): a Stripe **coupon** (50% off the
  first invoice) on the monthly price — keeps one clean product instead of a separate
  discounted one.
- **Currency:** prices are in **UAH (₴)**; confirm your Stripe account supports UAH
  settlement (otherwise charge in a supported currency and show ₴ as guidance).

**Checkout flow — two options:**

1. **Payment Links (recommended first — no backend).** One Stripe **Payment Link**
   per Price — send the store the link for their tier; the store pays by card; Stripe
   emails the receipt and manages the subscription, retries, and renewal reminders.
   Nothing to deploy — fits the static PWA. The owner still fulfils the placement by
   hand (§3) once payment lands.
2. **Worker + webhook self-fulfilment (built — activate with two secrets).** The
   metrics Worker (`worker/`) now exposes three routes: `GET /promote?store=<id>&tier=
   <t>&cadence=<c>` opens a **store-bound** Checkout Session, `POST /stripe-webhook`
   verifies Stripe's signature and writes/expires the promo in D1, and `GET /promos`
   serves the live set. The app fetches `/promos` on load and renders the gold pin/
   badge/offer automatically — **no `index.html` edit per sale**. See "Self-fulfil
   activation" below.

### Live Stripe objects (account "Lviv Second Hand", live mode)

Prices are **charged in UAH (₴)** and settle to the account's USD balance with Stripe's
currency conversion (~1% on top of card fees). Send a store the link for its tier and
cadence:

| Tier | Monthly link (₴/mo) | Annual link (₴/yr — 2 months free) |
|---|---|---|
| **Verified+** | ₴250 · https://buy.stripe.com/14A3cp09O3NieWh1kmgA803 | ₴2,500 · https://buy.stripe.com/fZu28l7Cg1Fa7tP6EGgA809 |
| **Featured** | ₴600 · https://buy.stripe.com/bJe28l1dS3Ni9BXe78gA804 | ₴6,000 · https://buy.stripe.com/eVq7sFbSw3NieWhfbcgA80a |
| **Spotlight** | ₴1,200 · https://buy.stripe.com/dRm00d2hWfw05lH2oqgA805 | ₴12,000 · https://buy.stripe.com/dRm14hg8M2JecO9d34gA80b |

**À la carte (one-time):**

| Item | Payment Link |
|---|---|
| Deal of the week — ₴300 | https://buy.stripe.com/4gM7sF1dS6Zu01n4wygA806 |
| Poster placement — ₴150 | https://buy.stripe.com/28E9AN6yc3Ni8xTgfggA807 |
| Sponsored push — ₴400 | https://buy.stripe.com/14A4gt8GkerW5lH6EGgA808 |

**Products & price IDs** (`prod` = product, monthly · annual price):
- Verified+ `prod_V1hJ671Gc5MJUt` — `price_1U1dvd7ZlQqI3gQVAk6edEci` · `price_1U1dvn7ZlQqI3gQVH2XJobOD`
- Featured `prod_V1hKO1ma6cXUiE` — `price_1U1dvq7ZlQqI3gQV51PMcCVM` · `price_1U1dvt7ZlQqI3gQVd8utdXLA`
- Spotlight `prod_V1hKo6mVYDGRYn` — `price_1U1dvv7ZlQqI3gQVR5qnNNHk` · `price_1U1dw17ZlQqI3gQVuizcyhYi`
- À la carte one-time — `price_1U1dwY7ZlQqI3gQVMZEzRBQT` (deal) · `price_1U1dwb7ZlQqI3gQVGSqqTa3x` (poster) · `price_1U1dwe7ZlQqI3gQV1yCPZoEc` (push)

**Intro offer:** all six subscription links accept promo codes — a store enters
**`FEATURED50`** (coupon `6QsSUgXf`, 50% off the first invoice) to get the first month
of Featured at ₴300 (or the same discount on any tier's first charge).

> The products/prices/links above are **live** — real charges. With self-fulfilment
> activated (below), a paid checkout writes the promo to D1 and the app shows it on
> its own; the generic Payment Links above still work but need the manual `promo` edit
> (§3), so prefer the store-bound `/promote` links once activated.

### Self-fulfil activation (owner, one-time)

The code ships **inert** until two secrets are set — until then `/promos` returns an
empty set and `/promote` + `/stripe-webhook` reply `503`, so nothing changes.

1. **Restricted Stripe key.** Stripe Dashboard → Developers → API keys → **Create
   restricted key** with **Checkout Sessions: Write** (everything else None). Add it as
   the repo secret **`STRIPE_API_KEY`**. Add **Billing Portal Sessions: Write** too if
   you want the in-app "Manage billing" link (optional — see below).
2. **Webhook endpoint.** Stripe Dashboard → Developers → Webhooks → **Add endpoint** →
   URL `https://lviv-metrics.lshanalytic.workers.dev/stripe-webhook`, events:
   `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted`, `customer.subscription.updated`. Copy its **signing
   secret** (`whsec_…`) into the repo secret **`STRIPE_WEBHOOK_SECRET`**.
3. **Deploy.** Push to `main` (or run the *Deploy metrics Worker* action) —
   `deploy-worker.yml` sets both secrets on the Worker. Confirm at
   `…workers.dev/status` (`promoConfigured: true`).

**How a sale then flows:** the owner/agent sends a store-bound link
`…/promote?store=<storeId>&tier=featured&cadence=monthly` (the app's in-store
**"Own this store? Promote it"** button builds one) → the store pays (₴, `FEATURED50`
still applies) → the webhook writes `promos(store_id, tier, offer, until, sub_id,
cust_id)` in D1 → the app's `/promos` fetch shows the pin/badge/offer within a page
load. Renewals extend `until` (`invoice.paid`); cancellation clears it
(`customer.subscription.deleted`).

### Self-service purchase (in-app)

A store owner does not need to be contacted first. In the app: open the store →
bottom of the store page → **📣 Own this store? Promote it** → a sheet showing the
full rate card. They pick monthly/annual, pick a tier, optionally type the offer
line shoppers will see, and pay. The CTA only appears when `/status` reports
`promoConfigured: true`, so it can never lead to a dead checkout.

The sheet's prices are **display-only** — what is actually charged comes from the
Stripe Price ids in `worker/worker.js`. A stale number in `PROMO_PLANS` (index.html)
cannot charge the wrong amount, but it will misinform, so **change both together**.

**Offer line.** Typed by whoever pays, capped at 48 chars, angle brackets stripped
and whitespace collapsed in the Worker (`cleanOffer`) on the way in *and* again in
the webhook, then escaped on render. Leave it blank and the card simply omits it.

**Self-service billing.** Once a subscription exists, the store page shows
**⚙️ Manage billing** → `/billing?store=<id>` → the Stripe customer portal (change
tier, update card, cancel). This needs the restricted key to *also* carry **Billing
Portal Sessions: Write** and a saved portal configuration in Stripe; without either
the route fails and the app just hides the link, so it is safe to skip.

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
| Badge on card | ✓ Verified (green) | ⭐ Sponsored (gold) | 🌟 Spotlight · Sponsored |
| Offer line | ✓ | ✓ | ✓ |
| List position | **unchanged** | boosted | boosted, above Featured |
| Map pin | **unchanged** | gold ⭐, 44px | gold 🌟, 50px, above all |

Verified+ is a trust badge, not an ad placement: it changes no ranking and no pin,
which is what keeps the map honest and keeps the two ad tiers worth their price. A
legacy promo with no `tier` is treated as Featured.

## 8. Rollout sequence

1. **Now:** system built; owner sells 3–5 Featured/Verified+ by hand at the intro
   price; fulfil via §3; gather testimonials + real redemption data.
2. **Validate:** lock the real prices from what stores actually pay.
3. **Phase 2:** hand selling to the agent with the one-time-bonus scheme and the
   bilingual sell-sheet; add analytics-backed ROI reports.
