# Retiring Stripe

The owner now trades as a ФОП and is moving payments to LiqPay (PrivatBank) and
bank-transfer invoices — see [FOP.md](FOP.md). This is the plan for taking Stripe
out completely: out of the purchase path, out of the code, and finally closing the
account.

> **Not legal or tax advice.** Items marked ⚖️ go to the accountant.

---

## What there is to wind down

Checked read-only on 2026-10-15 against production:

| | |
| --- | --- |
| Live Stripe subscriptions in the database | **0** (`promos` is empty) |
| À-la-carte orders | **0** |
| Stripe payments ever recorded | **1** — a ₴30 flash deal on 2026-08-12, almost certainly the owner's own test |
| Stripe still configured on the live Worker | yes — `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` |
| Live Stripe links outside the Worker | 9 Payment Links (docs/ADVERTISING.md) + the donate link in `index.html` |

So there are no customers to migrate. **The one blind spot:** sales through the
Payment Links and donations never reach the database — only the Stripe Dashboard
can confirm nothing was sold that way (Phase 0).

The plan below takes Stripe out of the purchase path **now** and sells by bank
transfer (the bot's `/invoice`) until LiqPay card checkout is live. That stops new
income landing outside the ФОП and starts the 120-day dispute clock immediately.
If Phase 0 finds live subscriptions, Phase 2 handles them first.

---

## Phase 0 — Audit the Stripe account (owner, 1–2 hours)

1. **Count every subscription.** dashboard.stripe.com → Subscriptions, all
   statuses (active, trialing, past due, unpaid, paused). Write the number down:
   **N**. Expected 0.
2. **Find the last charge.** Payments → export all time as CSV. Note the date of the
   latest charge (**LAST_CHARGE**) and anything paid through a Payment Link or the
   donate link. Note whether the ₴30 test on 2026-08-12 was your own card, and
   whether it was refunded.
3. **Record:** the USD balance (available + pending) and payout schedule; open
   disputes (should be 0); the account country (Settings → Business); and in
   Workbench → Webhooks, the endpoint's API version.
4. **Take the first full export** — Payments, Payouts, Transactions, Subscriptions,
   Customers, plus the *Balance summary* and *Payout reconciliation* reports as
   CSV. Keep them outside Stripe; they are only reachable while the account is open.
5. **Deactivate the 9 sales Payment Links** (Payment links → ⋯ → Deactivate). They
   never fulfilled anything automatically and the app doesn't use them. Leave the
   donate link for Phase 1, and **don't archive any Products or Prices yet** — the
   in-app checkout still points at them.
6. **Send the accountant the questions now** ⚖️ — they take longest:
   - how the pre-ФОП USD Stripe receipts are declared, and how to book any receipt
     dated after the ФОП registration (incl. the ₴30, with which date and rate);
   - how long the Stripe exports and payout-bank statements must be kept;
   - that LiqPay card sales need ПРРО receipts and **bank transfers to the ФОП IBAN
     need none** (Phase 1 depends on this);
   - whether donations to the ФОП are business income.
7. **Only if N > 0:** Settings → Billing → *Manage disputed payments* → cancel the
   subscription; and in the customer-portal settings, turn off subscription update
   and cancel, so a store can't undo a period-end cancellation.

**Done when** N, LAST_CHARGE, the balance, 0 open disputes, the country and the
webhook version are written down, the export is saved, and the 9 links are inactive.

---

## Phase 1 — Take Stripe out of the purchase path (Day 0–1)

1. **Code:** blank `DONATE_URL` in `index.html` (the donate button disappears) and
   delete the two Stripe steps from `.github/workflows/deploy-worker.yml`, so a
   deploy can never push the Stripe key back. Deploy.
2. **Owner:** once the live site no longer contains `buy.stripe.com`, deactivate the
   donate Payment Link — in that order, so nobody lands on Stripe's expired page.
3. **Owner:** remove the key from the Worker:
   `npx wrangler@3 secret delete STRIPE_API_KEY` (in `worker/`), or Cloudflare →
   Workers → lviv-metrics → Settings → Variables. Record the time as **T_CUT**.
   **Keep the GitHub repository secret for now** — it's the only copy, and Stripe
   won't show a restricted key again. **Keep the webhook and its secret** — a
   checkout opened just before T_CUT can still be paid for 24 hours.
4. **Verify:** `https://lviv-metrics.lshanalytic.workers.dev/status` shows
   `promoConfigured: false`; store pages no longer show Promote or Flash sale; and
   no store shows "Manage billing" (the Worker now only offers it while the Stripe
   key is set).
5. **Tell anyone selling** (field agents, stores you're talking to): no more
   `buy.stripe.com` links or old sell-sheets. Until LiqPay is live, sales are by
   **bank transfer**: the bot's `/invoice`, then `/paid` when the money arrives.

**Rollback** until Phase 3: put the key back from the repository secret by
re-adding the deleted workflow step and re-running the deploy, revert the
`DONATE_URL` change, and reactivate the links.

---

## Phase 2 — Wind down live subscriptions (only if N > 0)

Skipped when N = 0 (the expected case).

1. **Tell each store first** (email + Telegram): its Stripe plan stops renewing on
   *date*, the placement stays until then, how to continue (`/invoice` now, LiqPay
   later), and that cancellation goes through hello@lvivsecondhand.com.
2. **Cancel each at period end** — Dashboard → subscription → Cancel → *End of
   current period*. Never "immediately" without a replacement: the cancellation
   event takes the placement down at once.
3. **Faster per store:** the store buys its replacement first (`/invoice`+`/paid`,
   or LiqPay); the Worker now **warns you** when a purchase replaces a live
   subscription; then cancel the Stripe one immediately with a prorated refund.
   Never leave a Stripe subscription running after its replacement — that is
   double billing.
4. **If the webhook's API version is `2025-03-31.basil` or later:** renewals before
   this PR didn't extend placements. For each subscription, compare Stripe's period
   end with the placement's end date and correct or refund. (The Worker now reads
   both invoice shapes.)
5. **Payment-Link subscriptions** have no database row: cancel at period end the
   same way, and take their hand-made placement down on that date.

**Done when** Stripe shows 0 subscriptions in every status and each
`customer.subscription.deleted` was delivered. Record the latest period end as
**LAST_SERVICE_END**.

---

## Phase 3 — Shut the Stripe pipes, keep the account (T_CUT + 24 h)

Entry: at least 24 hours after T_CUT, Phase 2 done (or N = 0), and Workbench shows
no `checkout.session.completed` after T_CUT — if one appears, check it was
delivered and move LAST_CHARGE.

1. **Delete the webhook endpoint** (Workbench → Webhooks), then remove its secret:
   delete the repository secret `STRIPE_WEBHOOK_SECRET` and run
   `npx wrangler@3 secret delete STRIPE_WEBHOOK_SECRET`.
2. **Expire the restricted API key** (API keys → ⋯ → Expire), then delete the
   repository secret `STRIPE_API_KEY`. From here Phase 1 can't be rolled back
   without making a new key.
3. **Retire the catalogue:** deactivate the customer portal; archive the three
   Products, the Prices listed in docs/ADVERTISING.md, and the `FEATURED50` code.
4. **Protect the account through the dispute window:** switch payouts to manual (or
   set a minimum balance) so refunds and late disputes are paid from the balance
   rather than debited from the bank, keep the payout bank account open, and watch
   Stripe's dispute emails — the app never sees Stripe disputes.

**Done when** there's no webhook endpoint, the key is expired, no `STRIPE_*` secret
exists in GitHub or on the Worker (`npx wrangler@3 secret list`), and the account
is still open with its balance.

---

## Phase 4 — Ship PR #348 (invoices live, card checkout still off)

Entry: Phase 1 done; the ФОП details supplied; every placeholder gone
(`grep -n 'mark class=.todo' offer.html privacy.html` prints nothing; `SELLER_*`
in `worker/wrangler.toml` filled); the accountant has confirmed bank transfers need
no ПРРО receipt.

1. Before it goes public, make `offer.html` and `privacy.html` true for a world
   without Stripe: §8.1 (cancel by email; the placement runs to the end of the paid
   period — the code now does this), §5.3 (email receipts — only if ПРРО sends
   them), §4.3 (promo codes), §5.1 (Apple/Google Pay only if enabled in LiqPay);
   privacy names Stripe only as a past processor and adds bank-transfer invoices.
2. Merge #348 **without LiqPay keys**. Check `/status`, that `offer.html` and
   `privacy.html` serve the new text, and issue one `/invoice` to see the рахунок.

---

## Phase 5 — LiqPay card checkout live

Entry: Phase 4 deployed; the LiqPay shop approved; **ПРРО connected to the shop**
⚖️.

1. **LiqPay dashboard:** note the payout mode, enable Apple Pay / Google Pay (or
   keep them out of the offer), connect ПРРО with receipts by email.
2. **Ask the LiqPay manager:**
   1. Can refunds be paid from the balance? (By default they come out of later
      incoming payments.)
   2. How are chargebacks notified, and how is evidence submitted?
   3. Can the merchant cancel a customer's subscription in the dashboard, and is
      the server-to-server `unsubscribe` available?
   4. Do recurring-charge callbacks carry the subscription's original `order_id`?
      (Renewal depends on it.)
   5. Are callbacks for `version: 3` requests signed with SHA-1? (The current docs
      describe SHA3-256 for newer versions.)
3. **Sandbox** per [FOP.md §3.8](FOP.md): the app hides the buy buttons on sandbox
   keys, so open the test links directly. Each test is announced as
   `🧪 SANDBOX — nothing was published`.
4. **Go live:** swap in the live keys and set `PAY_PROVIDER=liqpay`; re-run the
   deploy. On your own card buy one ₴50 1-day run, one 3-hour flash deal and one
   extra; check each delivers, pings you and produces a ПРРО receipt. Refund the
   run and check the refund ping. If subscriptions are on, buy one monthly and
   watch for the renewal about 30 days later — if it doesn't come, sell 30-day runs
   instead until it's fixed.

**Rollback:** set `PAY_PROVIDER` to anything but `liqpay` and redeploy — checkout
hides, and LiqPay subscriptions already sold keep renewing, because the callback is
gated on the keys, not on `PAY_PROVIDER`.

---

## Phase 6 — Remove the Stripe code, tests and docs (2–3 days)

Entry: Phase 3 complete (no Stripe event can arrive) and #348 merged. Doesn't need
to wait for Phase 5.

Two traps first:
- `/promote` validates monthly/annual plans against `PROMO_PRICES` *before* the
  LiqPay branch — switch it to `PROMO_AMOUNTS` before deleting the Stripe prices.
- `stripeLocale()` is called before the LiqPay branch in `/promote`, `/flash-deal`
  and `/order` — remove those calls in the same change.

Then delete: the Stripe price/product ids, custom-field helpers, locale list,
portal probe, `verifyStripeSig`, `stripePayment`, `applyStripeEvent`, the Stripe
branches of the three purchase routes, and the `/billing`, `/billing-selftest` and
`/stripe-webhook` routes; the Stripe mode in `index.html` (coupon line, "Manage
billing", Stripe strings). **Keep** `claimPayment`'s first-sight insert (LiqPay's
charge records use it), `renewPromo`/`cancelPromo`, and the `promos.cust_id`
column. Don't blanket-remove `sub_` or `manage` — Telegram deep links and Web Push
use them.

Tests: port the four things only the Stripe tests cover (a one-off run, order
redelivery, PIN flash deal, empty flash text) to LiqPay callbacks, then delete the
Stripe sections. Docs: README (both languages), ADVERTISING.md (and remove the
Payment Link URLs from this public repo), FOP.md, and the Play Store data-safety
notes.

**Done when** `git grep -niE 'stripe|FEATURED50'` matches only the history lines
(privacy's "past processor" line and the closure record), CI is green, and one
LiqPay purchase still completes after the deploy.

---

## Phase 7 — Close the Stripe account

Earliest date: the latest of **LAST_CHARGE + 120 days** (2026-12-10 if 2026-08-12
is the last charge) and **LAST_SERVICE_END + 120 days** (none if N = 0) — card
networks allow disputes for about that long — and every dispute resolved.

1. Final export (repeat Phase 0 step 4, plus invoice PDFs, Stripe fee invoices and
   any tax documents).
2. Remove any minimum balance and pay out to exactly zero — Stripe won't close an
   account with a balance.
3. Settings → Business → Close account. Keep the payout bank account open until any
   final debit settles.
4. Hand the exports and bank statements to the accountant ⚖️; record the closure
   date in [FOP.md](FOP.md) §8.

---

## Already in the code (PR #348)

These make the steps above safe and needed no decisions:

- LiqPay's callback works whenever its keys are set, so switching checkout off
  never strands LiqPay subscriptions.
- "Manage billing" is only offered while the Stripe key is set — no dead link after
  Phase 1.
- Stripe renewals read both invoice shapes (old and `2025-03-31.basil`).
- Buying while a live subscription exists warns the owner to cancel the old one.
- A charge that renews nothing is flagged for a refund.
- A cancelled LiqPay subscription keeps its paid period; a refunded one tells the
  owner to cancel it in LiqPay.
- A delivery that fails after payment is retried, and the owner is told.
- Sandbox keys never publish anything.

## Decisions for the owner

1. **Cut Stripe checkout now** and sell by invoice until LiqPay is live
   (recommended — no sales are lost on current numbers), **or** keep Stripe until
   LiqPay is live (Stripe's exit then waits on the ПРРО date).
2. **Donations:** hide now; later a LiqPay donation link on the ФОП (declared as
   income ⚖️), a personal link outside it, or none.
3. **The FEATURED50 "−50% first month" offer** (also on the sell-sheet): honour it
   with a ₴300 invoice, build a half-price 30-day run, or withdraw it.
4. **LiqPay subscriptions at launch:** all at once, or runs/deals/extras first and
   monthly/annual after the first live renewal is seen.
5. **Make email required** for every LiqPay purchase (receipts, notices), or reword
   offer §5.3.
6. **Refund the ₴30 test charge** or not — ask the accountant how to book it.
7. **ПРРО provider:** PrivatBank's own or Checkbox. This sets the Phase 5 date.
