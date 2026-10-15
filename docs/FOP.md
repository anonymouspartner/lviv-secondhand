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
| Agents are paid to a card by hand, from a personal account | Paid from the business account, with the tax position clear |
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

- [ ] `privacy.html` §1 "Who we are" and §9 "Contact": name the ФОП as the operator
      and give a real contact address; keep the GitHub link as a secondary channel.
      Bump "Last updated".
- [ ] New `offer.html` — **публічна оферта** for paid placements, UA first + EN.
      Covers: what each tier/run/flash deal delivers (pull from `ADVERTISING.md` §2),
      price & currency, when service starts (on payment / on approval for flash
      deals without a PIN), labelling (`Реклама`), refusal & refund policy, renewal
      (§3.4), how to cancel, seller details. Same page chrome as `privacy.html`.
- [ ] Link the offer from: the promote sheet, the flash-deal sheet, the order
      buttons, `privacy.html` §10, and `sitemap.xml`.
- [ ] `promoSecure` string (UA/EN) — today it reassures about Stripe; reword to be
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

### 3.2 Shape of the change

Today each route (`/promote`, `/flash-deal`, `/order`) builds a Stripe form inline,
and `/stripe-webhook` hands raw Stripe events to `applyPromoEvent` /
`applyFlashDealEvent`. Split that into three layers:

```
route  ─▶  createCheckout(env, intent)  ─▶  provider adapter (stripe | liqpay)
                                                     │
webhook (/stripe-webhook | /liqpay-callback)  ─▶  normalise  ─▶  fulfil(env, payment, ctx)
```

- **`intent`** — `{ kind: 'promo'|'flashDeal'|'order', storeId, tier, cadence, item,
  amount (kopiyky), label, text, pin, lang }`. Amounts already live in kopiyky in
  `PROMO_RUNS` / `FLASH_DEAL_TIERS`; add kopiyky amounts beside the Stripe Price ids
  in `PROMO_PRICES` and `ORDER_ITEMS` so a non-Stripe provider has a number to charge.
  Kopiyky stay the internal unit everywhere; **LiqPay takes hryvnias**, so its
  adapter divides by 100 at the boundary and nowhere else.
- **`fulfil()`** — the body of today's `checkout.session.completed` branches, taking
  a normalised payment instead of a Stripe object. Stripe and LiqPay both end here,
  so promos, orders, flash deals, Instagram ads and Telegram notices behave
  identically whichever provider took the money. Renewals get the same treatment:
  `renew(env, subRef)` replaces the `invoice.paid` branch, `cancel(env, subRef)` the
  `customer.subscription.deleted` one.
- **Provider selection** — `PAY_PROVIDER = "liqpay" | "stripe"` in `[vars]`, falling
  back to Stripe when the LiqPay keys are absent (same "inert until configured" rule
  the Stripe code follows). `/status` reports which provider is live and whether its
  secrets are present.

### 3.3 New table: `payments`

```sql
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,          -- our order_id (LiqPay) / session id (Stripe) / invoice no.
  provider TEXT NOT NULL,       -- 'liqpay' | 'stripe' | 'invoice'
  kind TEXT NOT NULL,           -- 'promo' | 'flashDeal' | 'order'
  store_id TEXT NOT NULL,
  intent TEXT NOT NULL,         -- JSON: tier, cadence, item, pin …
  text TEXT,                    -- offer line / deal text / note, cleaned
  amount INTEGER NOT NULL,      -- kopiyky
  status TEXT NOT NULL DEFAULT 'created',  -- created → paid | failed | expired
  created TEXT NOT NULL DEFAULT (datetime('now')),
  paid TEXT
)
```

Added to `ensureSchema` like every other table. It does two jobs:

1. **Replaces Stripe's custom fields.** Local checkouts have no free-text field, so
   the offer line, flash-deal text and order note move into the app sheet. The
   paywall property is kept: the text is written to `payments.text` with status
   `created` and is **never read by `/promos` or the map until the webhook flips it
   to `paid`**. Cleaned on the way in with `cleanText()` and escaped on render, as
   today.
2. **Idempotency.** Webhooks retry; `fulfil()` runs only on the `created → paid`
   transition (`UPDATE … WHERE id = ? AND status = 'created'`, act only if a row
   changed).

### 3.4 Subscriptions → LiqPay `subscribe` (+ renewal link for invoices)

LiqPay keeps the monthly/annual tiers auto-renewing:

- Monthly / annual checkouts use `action: "subscribe"` with
  `subscribe_periodicity: "month" | "year"` and `subscribe_date_start` = now (UTC,
  `YYYY-MM-DD HH:MM:SS`). The first charge fulfils like a purchase; each later charge
  arrives on the callback and calls `renew()`, which extends `promos.until` by the
  same grace rule as today (`graceDays()`).
- `promos.sub_id` stores our LiqPay `order_id`, so renewals and cancellations find
  the row the same way Stripe's `sub_id` does. ⚖️/🧪 Confirm in the sandbox which
  `order_id` the recurring callbacks carry before relying on it.
- Status `unsubscribed` → `cancel()`.
- **Cancelling** replaces Stripe's `/billing` portal: an owner-facing
  `/billing?store=<id>&pin=<pin>` (or a link in the store's Telegram) calls LiqPay's
  `unsubscribe` API and confirms. Until that's built, the offer page says "write to
  us and we cancel within a day" and the owner cancels in the LiqPay dashboard.
- **Bank-transfer stores** (§5) can't be auto-charged, so for them the existing daily
  cron (`0 7 * * *` in `worker/wrangler.toml`) sends a **renewal invoice** 5 days
  before `until`, to the store's Telegram if it follows itself via `store_subs` and
  always to the owner. Paying early extends from the current `until`, not from today.
- Live Stripe subscriptions keep renewing through `/stripe-webhook` until they end
  naturally; nothing is migrated by force. `/billing` keeps sending Stripe customers
  to Stripe's portal.

### 3.5 LiqPay adapter specifics

- **Checkout.** Build the params JSON — `version: 3`, `public_key`, `action`
  (`pay` or `subscribe`), `amount` (**hryvnias**), `currency: "UAH"`, `description`
  (tier label), `order_id` (our `payments.id`), `language: "uk"`, `result_url` (the
  existing `?promoted=` / `?flashdeal=` / `?ordered=` return URLs), `server_url`
  (`/liqpay-callback`). Then `data = base64(JSON)` and
  `signature = base64(sha1(private_key + data + private_key))`.
  The checkout is a **POST** of `data` + `signature` to
  `https://www.liqpay.ua/api/3/checkout`, so the routes can't just 302 as they do
  for Stripe: they return a tiny self-submitting HTML form (same tab the app already
  opens with `window.open`). That page carries no secret — only the signed `data`.
- **Callback** `POST /liqpay-callback` (form-encoded `data` + `signature`):
  recompute the signature over `data` with the private key and compare in constant
  time (reuse the loop in `verifyStripeSig`); reject on mismatch. Then decode `data`.
  Handle it **before** rate limiting, as `/stripe-webhook` is.
- **Re-check before fulfilling.** LiqPay has no timestamp in the signature, so a
  captured callback could be replayed. The `created → paid` transition (§3.3)
  already makes a replay a no-op for one-off payments; for renewals, also call
  LiqPay's `status` API for that `order_id` and fulfil only what it confirms.
- Statuses: `success` / `subscribed` fulfil; `unsubscribed` cancels; `failure` /
  `error` / `reversed` mark the row (a `reversed` paid promo is also set
  `canceled` and the owner is told). Anything else (`processing`, 3-DS waits) is
  ignored until a final status arrives.
- Secrets: `LIQPAY_PUBLIC_KEY` in `[vars]`, `LIQPAY_PRIVATE_KEY` via
  `wrangler secret put`, never committed. Sandbox keys during testing. Document in
  `wrangler.toml` alongside the Stripe ones.

### 3.6 Front end (`index.html`)

- Promote sheet: add the optional offer-line input (48 chars, `OFFER_MAX`).
- Flash-deal sheet: add the required deal-text input (120 chars, `DEAL_MAX`) next to
  the PIN; keep `FLASH_TIERS` prices in sync with the Worker.
- Order buttons: optional note.
- Send the text via `POST` (not the query string) so it doesn't land in logs or
  history; the route still answers with the redirect URL.
- `checkPromotedReturn()` already handles the return; no change beyond copy.
- Pass the app language through as LiqPay's `language` (`uk` / `en`) — unlike
  Stripe, LiqPay has a Ukrainian checkout, so the `STRIPE_LOCALES` workaround isn't
  needed on this path.

### 3.7 Tests & checks

- `scripts/check-wiring.mjs`: assert the `FLASH_TIERS` ↔ `FLASH_DEAL_TIERS` amounts
  and the new kopiyky amounts agree.
- Unit-level fixtures under `scripts/fixtures/` for the callback: a valid signed
  LiqPay payload, a tampered one, a replayed one, a `failure` status, a recurring
  charge, an `unsubscribed`.
- End-to-end on the LiqPay **sandbox keys** before switching `PAY_PROVIDER` — one
  run, one flash deal, one order, and one monthly subscription.

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

For stores that would rather pay as a business, and at ₴0 acquiring fee.

- [ ] Bot owner command `/invoice <storeId> <tier> <cadence>` (or a button in the
      owner's store menu): creates a `payments` row with `provider = 'invoice'`,
      status `created`, and returns a printable **рахунок на оплату** page —
      `GET /invoice/<id>?t=<token>` on the Worker, HTML with the ФОП details, IBAN,
      amount, and the payment purpose string (`Оплата за рекламні послуги згідно
      рахунку №…, без ПДВ`). Token-gated like `/flash-deal/approve`.
- [ ] Owner marks it paid from Telegram (`/paid <id>`) once the transfer shows in
      the bank → the same `fulfil()` as an online payment.
- [ ] Then automate it: the 5-minute cron reads the PrivatBank **Автоклієнт API**
      statement for the ФОП account, matches the invoice number in the payment
      purpose and the amount, and calls `fulfil()` — owner told on Telegram either
      way. Token stored as a Worker secret, read-only scope. A transfer whose
      purpose or amount doesn't match is reported, never guessed.
- [ ] **Акт виконаних робіт** page from the same row once the period ends — the
      store's accountant will ask for it.
- [ ] Invoice numbering: sequential per year, stored in KV/D1.

---

## 6. Phase 5 — field agents ⚖️

Paying a private person (not a ФОП) for services makes the ФОП a **tax agent**:
withhold ПДФО (18%) and the military levy, and pay ЄСВ (22%) on top, with quarterly
reporting. Paying another ФОП against their invoice involves none of that. The bot
should make this visible rather than leave it to memory.

- [ ] `/card` flow also asks: "Ви ФОП? · Are you a ФОП?" — store `is_fop` and
      РНОКПП alongside the payout card/IBAN.
- [ ] `/report` and `/admin agents`: split payable totals into **ФОП agents** (pay
      the invoice in full) and **non-ФОП** (show gross, estimated withholding and the
      employer-side cost, with a ⚠️ to check with the accountant).
- [ ] `FIELD_AGENT.md`: add a section recommending agents register as ФОП group 2/3
      (КВЕД 73.11 / 74.90) before Phase 2 sales commissions begin, and a template
      **договір про надання послуг** + monthly **акт** between the owner's ФОП and
      the agent's.
- [ ] Payouts go from the ФОП account to the agent's **IBAN** (not card number) with
      a purpose line referencing the act — prefer IBAN in the `/card` prompt.

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
| 3 | `payments` table, `fulfil()` refactor, Stripe still the only adapter | medium — touches the live purchase path | yes, revert |
| 4 | LiqPay adapter + `/liqpay-callback` on the **sandbox keys** | low | yes |
| 5 | Sheet inputs for offer/deal text/note (§3.6) | low | yes |
| 6 | `PAY_PROVIDER=liqpay` live for **runs, flash deals, orders** | medium | flip the var back |
| 7 | LiqPay subscriptions + cancel flow (§3.4); monthly/annual move to LiqPay | medium | flip the var back |
| 8 | ПРРО (§4) | ⚖️ must be live **before** step 6 | — |
| 9 | Invoices (§5), agent ФОП flow (§6) | low | yes |
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
- `FIELD_AGENT.md`, `PLAY_STORE.md`, `PLAY_LISTING.md` — §6 and §7.

## 11. Open decisions for the owner

1. ~~Acquirer~~ — decided: **LiqPay**, on the existing PrivatBank ФОП account.
2. ПРРО: PrivatBank's own or Checkbox?
3. How much of the registration address to publish (⚖️).
4. Donations: inside the ФОП, or kept personal?
5. Are current agents willing to register as ФОП, or does the bot need the
   withholding view from day one?
