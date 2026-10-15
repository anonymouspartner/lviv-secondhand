# ФОП integration plan

The owner now runs the project as a **ФОП** (фізична особа-підприємець, Ukrainian
sole proprietor). This document is the plan for putting that to work in the app:
where money comes in, where it goes out, and what the public pages must say.

> **Not legal or tax advice.** Every item marked ⚖️ is a point to confirm with a
> Ukrainian accountant before relying on it. Rates and fees marked ≈ are typical
> figures to verify against the provider's current tariff.

---

## 0. Why bother — what changes

| Today | With the ФОП |
| --- | --- |
| Stripe only. Charged in ₴, settled in USD: ≈2.9% + fixed **+ ≈1% FX** per sale | LiqPay settles in ₴ to the existing PrivatBank ФОП account, ≈1.5%, no FX |
| Stripe's checkout has **no Ukrainian locale** (`STRIPE_LOCALES` in `worker/worker.js`) | Local checkout pages are Ukrainian-first |
| Bank transfer is an informal fallback (`ADVERTISING.md` §6) | Proper **рахунок + акт** a store (usually a ФОП itself) can expense |
| Play account planned as an individual (`PLAY_STORE.md`) | Organisation account via a free D-U-N-S number |
| `privacy.html` "Who we are" names no seller; contact is GitHub issues | Seller identified as e-commerce law expects, plus a public offer |

Nothing here removes Stripe on day one. Stripe stays as the fallback provider until
the local one has run cleanly for a month (§9).

---

## 1. Phase 0 — paperwork (owner, no code)

Everything after this depends on these. Order matters: the acquirer will ask for the
offer page (§2) and the ПРРО (§4) during onboarding.

- [ ] ⚖️ **Tax group 3 (5%, non-VAT)** — the usual fit for selling advertising to
      businesses. Group 2 limits who you may serve; check it covers your buyers
      before staying on it.
- [ ] ⚖️ **КВЕДи** include advertising and the web platform:
      **73.11** (рекламні агентства), **73.12** (посередництво в розміщенні реклами),
      **63.12** (веб-портали). Add via Дія if missing.
- [x] **Business (ФОП) account** — **PrivatBank**, already open. Note the IBAN for
      `SELLER_IBAN` (§2).
- [ ] **LiqPay** — PrivatBank's own acquirer, connected from Privat24 для бізнесу
      (§3.1). Create a shop for `www.lvivsecondhand.com`, keep the **public** and
      **private** keys, and note the **sandbox** keys for testing.
- [ ] **Автоклієнт API** in Privat24 для бізнесу — read-only statement access, so
      bank-transfer invoices can be marked paid automatically (§5).
- [ ] ⚖️ **ПРРО** (software cash register) — PrivatBank's own ПРРО or Checkbox.
      Register it with ДПС and connect it to LiqPay (§4).
- [ ] **D-U-N-S number** for the ФОП (free, via Dun & Bradstreet's Apple/Google
      request form) — needed for §7.
- [ ] Decide what stays on Stripe: the existing account, live subscriptions, and the
      donate link (§8).

---

## 2. Phase 1 — seller identity & public offer (small, ship first)

Required before the acquirer will go live, and cheap.

**Single source of truth.** Add a `SELLER` block — name `ФОП <Прізвище І. П.>`,
РНОКПП, address of registration (or city only — ⚖️ confirm what must be public),
email, phone/Telegram — in one place:

- `index.html`: a `SELLER` const next to `DONATE_URL`, used by the promote and
  flash-deal sheets ("Продавець: ФОП …, умови — Публічна оферта").
- `worker/wrangler.toml` `[vars]`: `SELLER_NAME`, `SELLER_TAX_ID`, `SELLER_IBAN`
  for invoices (§5). The IBAN is not a secret, but keep it out of the static page.

**Pages.**

- [x] `privacy.html` §1 "Who we are" and §9 "Contact": name the ФОП as the operator
      and give a real contact address; keep the GitHub link as a secondary channel.
      Bump "Last updated".
- [x] New `offer.html` — **публічна оферта** for paid placements, UA first + EN.
      Covers: what each tier/run/flash deal delivers (pull from `ADVERTISING.md` §2),
      price & currency, when service starts (on payment / on approval for flash
      deals without a PIN), labelling (`Реклама`), refusal & refund policy, renewal
      (§3.4), how to cancel, seller details. Same page chrome as `privacy.html`.
- [x] Link the offer from: the promote sheet, the flash-deal sheet, the order
      buttons, the help sheet, `privacy.html` §1, and `sitemap.xml`.
- [ ] **Fill in the ФОП details** — every highlighted placeholder in `offer.html`
      and `privacy.html` (`grep -n 'mark class=.todo' offer.html privacy.html`).
      Not merged until this is done.
- [ ] `promoSecure` string (UA/EN) — leave as is until LiqPay is live (it is still
      true while Stripe takes the payments), then reword to be
      provider-neutral ("Безпечна оплата карткою · Умови — публічна оферта").

**Done when:** an acquirer reviewer can find seller name, tax id, contact, offer and
refund terms from the checkout button in two taps.

---

## 3. Phase 2 — Ukrainian acquirer in the Worker (the main piece)

### 3.1 Provider choice

| | **LiqPay** | plata by mono | WayForPay |
| --- | --- | --- | --- |
| Fee ≈ | 1.5% | 1.3% | 2% |
| Webhook auth | base64 `data` + signature with the private key | ECDSA `X-Sign` | HMAC-MD5 |
| Recurring | `subscribe` action — real card subscriptions | card tokens (charge yourself) | regular payments |
| ПРРО | PrivatBank ПРРО / Checkbox | Checkbox | Checkbox / own |
| Test mode | sandbox keys | test token | test merchant |
| Needs a new bank account | **no** — settles to the existing PrivatBank ФОП | yes (mono ФОП) | no |

**Decision: LiqPay.** The ФОП already banks with PrivatBank, so LiqPay settles
straight into the existing account with no second bank to open. It is the only one of
the three with **true card subscriptions**, which keeps the monthly/annual tiers
auto-renewing the way Stripe does today (§3.4). The design below is
provider-agnostic, so another acquirer stays one adapter away.

### 3.2 What was built

**Built and tested; off until switched on (§3.8).** Stripe still takes every payment
until `PAY_PROVIDER` says otherwise.

```
/promote · /flash-deal · /order ─┬─ Stripe: Checkout Session (unchanged)
                                 └─ LiqPay: liqpayCheckout() → 'created' payments row + signed form
/stripe-webhook ── stripePayment() ─┐
/liqpay-callback ── applyLiqpayCallback() ─┴─▶ claimPayment() ─▶ fulfil() ─▶ promo | order | flash deal
                                                renewPromo() / cancelPromo() for subscriptions
```

All in `worker/worker.js`:

- **`fulfil()`** — one delivery path for promotions, orders and flash deals, taking a
  normalised payment `{ id, provider, kind, storeId, tier, cadence, item, pin, text,
  amount (kopiyky), currency, email, subRef, custRef }`. Placements, the owner's
  Telegram pings, the Instagram queue and map patches behave the same whichever
  provider took the money. `renewPromo()` / `cancelPromo()` handle subscriptions by
  the provider's subscription reference.
- **Provider selection** — `payProvider(env)`: LiqPay only when `PAY_PROVIDER` is
  `"liqpay"` **and** both keys are set; otherwise Stripe. `/status` reports
  `provider`, which is how the app knows to show its extra inputs.
- **Amounts** — kopiyky everywhere; `PROMO_AMOUNTS` and `ORDER_ITEMS[*].amount` added
  beside the Stripe Price ids. LiqPay takes hryvnias, converted only inside its
  adapter.

### 3.3 The `payments` ledger

```sql
payments (id TEXT PRIMARY KEY, provider, kind, store_id, intent JSON, text,
          amount INTEGER, email, status 'created'|'paid'|'failed', created, paid)
```

- **Exactly once.** A payment is fulfilled only by the call that moves its row to
  `paid` (`claimPayment()`). Providers redeliver events; before this, a redelivered
  Stripe purchase pinged the owner again and queued a second Instagram ad.
- **Text behind the paywall.** LiqPay's checkout has no free-text field, so the app
  sends the offer line / deal text / email with the checkout request and the Worker
  holds them in a `created` row. Nothing reads them until the paid callback flips
  the row, so — as with Stripe — unpaid text is never published.
- **Every LiqPay charge** is also recorded under its own `payment_id`
  (`lp_pay_<id>`), which is what makes a redelivered callback and a redelivered
  renewal no-ops.

### 3.4 Subscriptions

- Monthly / annual on LiqPay are `action: "subscribe"` with
  `subscribe_periodicity: "month" | "year"`. The first charge fulfils; any later
  charge (a new `payment_id` on an already-paid subscription order) renews.
  `promos.sub_id` holds the LiqPay `order_id`.
- `unsubscribed` → `cancelPromo()`. `reversed` (refund or chargeback) ends a
  subscription and tells the owner; for anything else the owner decides, because a
  newer purchase may already have replaced it.
- **Cancelling** a LiqPay subscription: by email to the address on the offer page
  (§8.1 there); the owner cancels it in the LiqPay dashboard. The in-app "Manage
  billing" link stays Stripe-only, and is hidden for LiqPay placements.
- 🧪 Confirm in the sandbox that a recurring charge's callback carries the
  subscription's original `order_id` — renewal depends on it.
- **Bank-transfer stores** (§5) can't be auto-charged; for them the daily cron sends
  a renewal invoice 5 days before `until` (not built yet — part of §5).
- Live Stripe subscriptions keep renewing through `/stripe-webhook`; nothing is
  migrated by force.

### 3.5 LiqPay specifics

- **Checkout** — `data = base64(JSON params)`,
  `signature = base64(sha1(private_key + data + private_key))`, posted to
  `https://www.liqpay.ua/api/3/checkout`. That's a form POST, so the route answers
  with a small self-submitting page (with a button as a fallback) instead of a
  redirect. The page carries only the signed `data`, never the private key.
- **Callback** `POST /liqpay-callback` — signature verified in constant time before
  anything is read; handled before rate limiting; `503` while LiqPay is off.
- **Statuses** — `success` / `subscribed` fulfil; `sandbox` counts as paid **only
  while the keys are sandbox keys**, so a test card can never fulfil on the live
  shop; `failure` / `error` mark the row failed; `processing` and 3-D Secure waits
  are ignored until a final status arrives.
- **Return** — `result_url` is `/liqpay-return`, which sends the buyer to the app's
  existing thanks screen (`?promoted=` / `?flashdeal=` / `?ordered=`), or to the
  "cancelled" one if the payment is known to have failed. It only accepts those
  three return shapes.
- **Promotion codes** (`FEATURED50`) are a Stripe feature; LiqPay's checkout has
  nowhere to enter one, so the app hides the coupon line under LiqPay. If the intro
  offer should continue, it needs a price of its own.

### 3.6 Front end (`index.html`)

Under LiqPay only (Stripe mode is unchanged):

- Promote sheet: optional **offer line** (48 chars) and **email** inputs. Email is
  required for an à la carte extra, since it's arranged by hand.
- Flash-deal sheet: required **deal text** (120 chars).
- Payment note reads "Secure card payment via LiqPay (PrivatBank)"; coupon line hidden.
- These travel as query parameters on the checkout link. The text is ad copy meant
  to be public once paid, and the email goes no further than the Worker.

### 3.7 Tests

`scripts/check-payments.mjs` (in CI) runs the Worker against a real SQLite database
and feeds it signed events: Stripe purchase, redelivery, renewal, cancellation,
one-off run, order, both flash-deal paths; LiqPay checkout params and signature,
forged / processing / failed / sandbox-on-live callbacks, subscription, repeated
callbacks, renewal and its redelivery, cancellation, the return redirect; and that
every price the app shows equals what the Worker charges.

### 3.8 Switching LiqPay on

1. In GitHub → the repository → Settings → Secrets and variables → Actions, add
   `LIQPAY_PUBLIC_KEY` and `LIQPAY_PRIVATE_KEY` (the **sandbox** keys first) and
   `PAY_PROVIDER` = `liqpay`.
2. Re-run the "Deploy metrics Worker" workflow (Actions tab) so it pushes them.
3. Make one sandbox purchase of each kind with LiqPay's test card: a 1-day run, a
   monthly plan, a flash deal, an extra. Each should ping you on Telegram.
4. Once the shop is approved, replace the two keys with the live ones and re-run the
   deploy. To go back to Stripe at any point, set `PAY_PROVIDER` to `stripe` and
   re-run.

---

## 4. Phase 3 — fiscal receipts (ПРРО) ⚖️

A ФОП on groups 2–4 generally must issue a fiscal receipt for card payments taken
online. Plan for it to need **no code**:

- [ ] Turn on fiscalisation for the LiqPay shop (PrivatBank's ПРРО or Checkbox);
      each successful payment is fiscalised and the receipt emailed.
- [ ] To make that email arrive, ask for the buyer's email (optional field) in the
      sheet and pass it as the receipt destination.
- [ ] If the integration can't do it, fall back to calling the Checkbox API from
      `fulfil()` via `ctx.waitUntil`, failures swallowed and reported to the owner on
      Telegram — same pattern as `queueInstagramAd`.
- Bank transfers to the IBAN (§5) need no fiscal receipt ⚖️.

---

## 5. Phase 4 — invoices for stores (рахунок + акт)

For stores that would rather pay as a business, at no acquiring fee. **Built.**

- **`/invoice <store> <plan> [buyer]`** in the bot (owner only), e.g.
  `/invoice c21 featured monthly` or `/invoice c21 poster ФОП Іваненко І. І.`.
  It issues a рахунок and replies with its link, the amount, and the payment
  purpose line (`Оплата за рекламні послуги згідно з рахунком № 2026-001 від …,
  без ПДВ`). Numbers run in sequence per year: `2026-001`, `2026-002`, …
- **The invoice page** (`GET /invoice`, opened by a per-invoice token) shows the
  seller with IBAN, the buyer, the service, the total with the amount in words, the
  purpose line, and a print / save-as-PDF button. It refers to the public offer.
- **`/paid <number>`** once the transfer is in the bank. It goes through the same
  `claimPayment()` → `fulfil()` as a card payment: the placement goes live and you
  get the usual "paid" ping. A second `/paid` does nothing.
- **The act** (акт надання послуг) is the same link with `&doc=act`, available once
  paid.
- **Seller details** come from `SELLER_*` in `worker/wrangler.toml` `[vars]` — the
  same details as the offer page. Until they're filled in, `/invoice` says so instead
  of issuing a blank invoice.

Not built yet:

- [ ] Automatic matching against the PrivatBank statement (Автоклієнт API), so
      `/paid` isn't needed. Needs the API token and a look at the real statement
      format first.
- [ ] Renewal invoices: an invoiced monthly plan doesn't auto-renew. A reminder
      from the daily cron 5 days before `until` would fit here.

---

## 6. Phase 5 — field agents — decided: no change

The owner pays agents directly, as today. Nothing in the bot changes: `/card`,
`/report` and `/admin agents` stay as they are.

⚖️ Worth knowing, not acting on: paying a private person (not a ФОП) for services
from the ФОП account can make the ФОП a tax agent for that payment (ПДФО, the
military levy, ЄСВ). How the owner pays is the owner's call; confirm the position
with the accountant.

---

## 7. Phase 6 — Google Play as an organisation

- [ ] Use the D-U-N-S number from Phase 0 to open the developer account as an
      **organisation** (the ФОП name shows as the developer).
- [ ] Update `docs/PLAY_STORE.md` §prerequisites and `PLAY_LISTING.md`: account type,
      developer contact email/address, and the ФОП-backed privacy URL.
- [ ] Benefit: avoids the closed-testing gate that new personal accounts face before
      production release.

---

## 8. Stripe & donations — what happens to them

- **Stripe stays configured** as `PAY_PROVIDER` fallback and for its live
  subscriptions until they lapse. After a month of clean LiqPay traffic, stop
  creating new Stripe sessions; leave `/stripe-webhook` running until the last
  subscription ends.
- **Donations** (`DONATE_URL` in `index.html`): ⚖️ money paid to the ФОП is generally
  business income and taxed as such. Either keep the Stripe donation link outside the
  ФОП, or move donations to a LiqPay `paydonate` link on the ФОП and declare them as
  income. Owner's call — record the decision here.

---

## 9. Rollout order

| # | Step | Risk | Reversible |
| --- | --- | --- | --- |
| 1 | Phase 0 paperwork | none | — |
| 2 | Seller identity + `offer.html` (§2) | none | yes |
| 3 | ✅ `payments` table, `fulfil()` refactor, Stripe still the only adapter | medium — touches the live purchase path | yes, revert |
| 4 | ✅ built — LiqPay adapter + `/liqpay-callback`; next: run it on the **sandbox keys** (§3.8) | low | yes |
| 5 | ✅ Sheet inputs for offer / deal text / email (§3.6) | low | yes |
| 6 | `PAY_PROVIDER=liqpay` live for **runs, flash deals, orders** | medium | flip the var back |
| 7 | LiqPay subscriptions (§3.4, built) go live with step 6 | medium | flip the var back |
| 8 | ПРРО (§4) | ⚖️ must be live **before** step 6 | — |
| 9 | ✅ Invoices (§5) — needs the `SELLER_*` details | low | yes |
| 10 | Play organisation account (§7) | none | — |

Step 3 ships alone and is verified against real Stripe purchases (one ₴50
`verified_run1`) before any LiqPay code lands, so a regression is caught while there
is only one provider to blame.

---

## 10. Docs to update as each phase lands

- `ADVERTISING.md` §4 (fees), §6 (collection, Tax/FOP → link here), §7 (provider).
- `README.md` monetisation costs line (EN + UA) — drop the FX note once LiqPay is live.
- `privacy.html` — seller identity; name LiqPay (PrivatBank) as a processor of
  payment data (we still never see card numbers).
- `worker/wrangler.toml` — `PAY_PROVIDER`, `LIQPAY_PUBLIC_KEY`,
  `LIQPAY_PRIVATE_KEY` (secret), the Автоклієнт token (secret), `SELLER_*`.
- `PLAY_STORE.md`, `PLAY_LISTING.md` — §7.

## 11. Open decisions for the owner

1. ~~Acquirer~~ — decided: **LiqPay**, on the existing PrivatBank ФОП account.
2. ПРРО: PrivatBank's own or Checkbox?
3. How much of the registration address to publish (⚖️).
4. Donations: inside the ФОП, or kept personal?
5. ~~Agents~~ — decided: paid directly, no bot changes (§6).
