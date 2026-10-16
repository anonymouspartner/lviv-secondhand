# Stripe: no longer used, account kept

The owner now trades as a ФОП and takes payments through LiqPay (PrivatBank) and
bank-transfer invoices — see [FOP.md](FOP.md). This page records what happened to
Stripe.

> **Not legal or tax advice.** Items marked ⚖️ go to the accountant.

---

## The decision (16 Oct 2026)

**Leave the Stripe account exactly as it is** — no deactivating, deleting, exporting
or closing anything in it. The account is shared with another business, so it is
not this project's to close. **The site stops showing and using Stripe**, and
switches to LiqPay. Until LiqPay card checkout is live, stores pay by invoice.

What the owner's check of the account found:

| | |
| --- | --- |
| Active Stripe subscriptions | **0** |
| Stripe payments for this project ever | **1** — a ₴30 flash deal on 2026-08-12, almost certainly the owner's own test |
| The account | shared with another business, which charges in USD; its events reach this project's webhook too |
| Webhook endpoint API version | `2026-06-24.dahlia` |
| Secrets | `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` stay in GitHub and on the Worker |

---

## What the code does now (PR #348)

- **No Stripe checkout.** `/promote`, `/flash-deal` and `/order` open LiqPay only.
  Until `PAY_PROVIDER=liqpay` and both LiqPay keys are set they answer `503`, and
  the app hides the Promote and Flash sale buttons (`/status` says
  `promoConfigured: false`). The Stripe key alone opens nothing.
- **No Stripe links on the site.** The donate button is hidden (`DONATE_URL` is
  empty), the "−50% first month" coupon line is gone, and the Payment Link URLs are
  out of the docs.
- **`/stripe-webhook` keeps answering.** It verifies the signature and answers
  `200` to every event it can verify. Events from the other business are ignored
  without a word. An event for an old subscription of this project (there are
  none) is still applied. It answers `5xx` only when its own database write fails,
  so Stripe retries that delivery.
- **Old Payment Links.** They are still live at Stripe, because the account is left
  as it is, but nothing points at them any more. If someone pays one in hryvnias,
  the owner gets a Telegram message — *A STRIPE PAYMENT ARRIVED THROUGH AN OLD
  PAYMENT LINK* — with the amount, the email and the session id. Nothing is
  delivered automatically: arrange the placement by hand, or refund it in the
  Stripe dashboard.
- **The API key** now backs only `/billing` (Stripe's customer portal, for a store
  with an old Stripe subscription — none exist). No purchase route calls Stripe.
  The deploy workflow still pushes both secrets, as the owner asked.

`scripts/check-payments.mjs` (in CI) covers each of these: no checkout with only
the Stripe key, silence for the other business's events, the ping for a hryvnia
payment through an old link, and that renewals and cancellations of an old
subscription still apply.

---

## What happens next

1. **Merge PR #348** (the ФОП details are filled in). Invoices go live: `/invoice <store> <plan> [buyer]` in the bot, `/paid <number>` when the
   money arrives.
2. **Sandbox test:** set the repository secret `PAY_PROVIDER` = `liqpay` (the
   sandbox keys are already there), re-run "Deploy metrics Worker" and make one test
   purchase of each kind — links in [FOP.md §3.8](FOP.md). Each answers with a
   `🧪 SANDBOX — nothing was published` ping.
3. **LiqPay activation** (owner), once the offer page with the seller details is
   live — LiqPay's review checks the site.
4. **ПРРО** connected to the LiqPay shop ⚖️.
5. **Live keys:** replace the two LiqPay secrets with the live ones and re-run the
   deploy. The buy buttons appear. Buy one ₴50 1-day run, one 3-hour flash deal and
   one extra on your own card; check each delivers, pings you and produces a ПРРО
   receipt. If monthly plans are on, watch for the first renewal about 30 days
   later.

**To switch card checkout off again** at any point: set `PAY_PROVIDER` to `off` and
re-run the deploy. LiqPay subscriptions already sold keep renewing and cancelling,
because the callback depends on the keys, not on `PAY_PROVIDER`.

### Questions for the LiqPay manager

1. Can refunds be paid from the balance? (By default they come out of later incoming
   payments.)
2. How are chargebacks notified, and how is evidence submitted?
3. Can the merchant cancel a customer's subscription in the dashboard, and is the
   server-to-server `unsubscribe` available?
4. Are callbacks for `version: 3` requests signed with SHA-1? (The newer docs
   describe SHA3-256.)

### Questions for the accountant ⚖️

- How the USD received through Stripe before the ФОП existed is declared, and how to
  book the ₴30 charge of 2026-08-12 (and whether to refund it).
- That LiqPay card sales need ПРРО receipts and bank transfers to the ФОП IBAN need
  none.
- Whether donations to the ФОП are business income.

---

## Not planned: removing the rest of the Stripe code

The webhook, `/billing`, `stripePayment()` and their tests stay while the shared
account keeps sending events to `/stripe-webhook`. Removing them would make those
deliveries fail and Stripe would keep retrying them. Only if the owner later removes
or repoints that webhook endpoint in the Stripe dashboard can the code go; that is
the owner's call, and nothing here asks for it.
