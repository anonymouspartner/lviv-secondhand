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
- **Agent cost when selling (Phase 2):** a **one-time bonus per signed store**
  (proposed ₴300–₴500 Featured, ₴800 Spotlight). No recurring trailer.
- **Margin:** software — very high. The only real variable cost is agent commission.

**CAC vs LTV (example, Featured):**
- Acquire ≈ 2–3 visits (₴160–₴240) + ₴300–₴500 bonus ≈ **₴500–₴750 CAC**.
- LTV ≈ ₴600/mo × ~6 months retention ≈ **₴3,600**. Ratio ≈ 5–7× — healthy.

**Break-even (example):** if the agent's weekly base ≈ ₴3,000 (~40 visits), about
**5 Featured subscriptions** (₴600) cover the agent; every additional subscription is
near-pure margin minus its one-time bonus.

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

1. **Payment Links (recommended first — no backend).** Create one Stripe **Payment
   Link** per Price in the Stripe Dashboard. The owner (or agent) sends the store the
   link for their tier; the store pays by card; Stripe emails the receipt and manages
   the subscription, retries, and renewal reminders. Nothing to deploy — fits the
   static PWA. The owner still fulfils the placement by hand (§3) once payment lands.
2. **Worker + Checkout Sessions (later, automated).** The existing Cloudflare Worker
   (`telegram-bot/`) gains a small endpoint that creates a Checkout Session, and a
   Stripe **webhook** flips the store's `promo` / Verified state on `checkout.session
   .completed` and clears it on cancellation/expiry — closing the loop so a sale
   self-fulfils. Build this once volume justifies removing the manual step.

> **Setup status.** Wiring live products/prices/links needs the **Stripe connector
> authorized** in this workspace (it currently is not) plus the account's keys.
> Once that's done, the tiers above can be created as Stripe Products/Prices and the
> Payment Links generated. Until then this section is the plan of record.

## 8. Rollout sequence

1. **Now:** system built; owner sells 3–5 Featured/Verified+ by hand at the intro
   price; fulfil via §3; gather testimonials + real redemption data.
2. **Validate:** lock the real prices from what stores actually pay.
3. **Phase 2:** hand selling to the agent with the one-time-bonus scheme and the
   bilingual sell-sheet; add analytics-backed ROI reports.
