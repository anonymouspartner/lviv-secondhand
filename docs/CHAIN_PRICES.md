# Chain prices — today's prices, published by the chain

How the app shows what HUMANA charges today, where that comes from, why it is
free and unpaid, and what to do when it breaks.

---

## 1. The problem it solves

The app's whole premise is *when is this store cheapest*. For by-weight stores it
answers that exactly: `kgPrices` gives a ₴/kg for every day of the cycle.

For **itemized** stores it could not answer it at all. All seven HUMANA branches
are `pricing: 'item'`, and `renderStore` has always shown them no price box,
because there is nothing in `stores.json` to fill it with — only the cycle
estimate ("day 22 of 35, mid-cycle"), which says where a store is in its cycle
but never what anything costs.

Meanwhile HUMANA publishes exactly that, free, every morning, on its own public
Telegram channel [@humanalviv](https://t.me/humanalviv):

```
ДОБРОГО РАНКУ, ДРУЗІ!
Сьогодні ловіть приємні ціни:
🏷️ Білий цінник — 250 грн
👟 Взуття та текстиль — 250 грн
💎 «Ексклюзив» — –50%
```

That is today's real price at every branch in Lviv. This feature reads it.

## 2. What is *not* copied

Only the numbers. The parser extracts facts — `{key:'white', uah:250}` — and the
app renders its own EN/UA labels from the keys, next to a link to the source
post. The channel's images are never fetched or displayed, and its copy is never
reproduced.

This is deliberate on two counts. Republishing someone's poster wholesale is
republishing their creative work; quoting a price with attribution is not.
And a link back sends them subscribers, which makes this a gift rather than a
taking.

**It is also editorial, not advertising.** The placement is free, and HUMANA has
not paid for it, so it must never look like the placements that *are* paid for:
no gold pin, no ⭐ badge, no `promo-card` styling, no map-position change. It is a
neutral card with a visible source line. Blurring that line would devalue every
tier in [ADVERTISING.md](ADVERTISING.md) — and mislead shoppers about what the
gold styling means.

## 3. How it works

```
t.me/s/humanalviv ──(*/5 cron, time-gated)──► worker/worker.js ──► D1 chain_feed
                                                                        │
                                          index.html ◄── GET /chain-prices
```

**Reading.** Telegram serves a public HTML preview of any public channel at
`https://t.me/s/<channel>` — no API key, no bot, no account. (A Telegram *bot*
cannot do this: a bot only receives a channel's posts if it is an admin there.)
It does require a browser-shaped `User-Agent`; with none at all the request is
redirected away.

**Polling.** There is no new cron trigger. The poll rides on the existing
`*/5 * * * *` sweep in `scheduled()`, gated to the hours the channel actually
posts (05:00–16:00 Kyiv) and to one fetch per 45 minutes — about a dozen requests
a day. Riding the existing trigger also means `wrangler.toml` is unchanged and
nothing about deployment moves.

**Parsing.** `worker/chain-feed.mjs`, a pure module with no Worker APIs, so
`scripts/check-chain-feed.mjs` can drive it under plain Node against saved
fixtures. It anchors on the category noun (`цінник`, `взуття`/`текстиль`,
`ексклюзив`) rather than matching whole lines, because the channel rewrites its
wording constantly and the noun is the only stable part.

**Storage.** One row per chain in the `chain_feed` D1 table, always overwritten.
This is a cache of one day's fact, not a history.

**Serving.** `GET /chain-prices` (public, no secret) returns:

```json
{ "humana": {
    "day": "2026-09-07",
    "postId": 2002,
    "url": "https://t.me/humanalviv/2002",
    "lines": [ {"key":"white","uah":250},
               {"key":"shoesTextile","uah":250},
               {"key":"exclusive","pct":50} ] } }
```

**Rendering.** `loadChainPrices()` in `index.html` merges it on load, the same
fire-and-forget contract as `loadRemotePromos()`. A card appears at the top of
the store detail and a chip in the store card's tag row. The feed keys off the
store's `type`, so it covers the whole chain at once.

## 4. Failing closed

A stale price is worse than no price: it carries no hint that it is old, and
somebody acts on it standing in the shop. So every layer refuses rather than
guesses.

| Guard | Where |
|---|---|
| Only a post made **today** (Europe/Kyiv) counts — never "the latest post" | `readChannelPrices` |
| A post yielding no recognised line stores **nothing** — no partial rows | `readChannelPrices` |
| Amounts outside ₴10–5000, discounts outside 5–90% are dropped | `chain-feed.mjs` bounds |
| The row is re-checked against today's date **at read time**, not just at write | `GET /chain-prices` |
| The app checks the day **again** in the browser, in Kyiv time | `chainPricesFor()` |

Consequence: if the poll silently stops working, the price box disappears within
a day. It cannot freeze on an old number.

## 5. When the wording changes

This is the likeliest failure, and the one the system cannot see for itself — a
day with no price post looks identical to a day whose price post we failed to
read.

So it distinguishes them. When today's post contains a price-shaped token
(`грн`, `₴`, `%`) but the parser extracts nothing, the Worker sends the owner a
Telegram message with the raw text, **once per day** (`chain_feed.alerted`).

To fix: add the new wording to `CATEGORIES` in `worker/chain-feed.mjs`, add the
post as a case in `scripts/check-chain-feed.mjs`, and deploy. If the change is
big, save the page as a new fixture in `scripts/fixtures/`.

## 6. Opting a store out

A branch whose prices do not follow the chain post gets `"chainPrices": false`
in `stores.json`. **HUMANA Vintage (h7)** is set this way: it is a different
format, and whether the chain-wide prices apply there has not been confirmed in
person. Remove the flag once it has.

## 7. What this does *not* do

**The collection calendar is not scraped.** `restockDates` — each chain's
published new-collection days — comes from the channel's *pinned* post, and those
dates live inside the pinned **image**, not in any post's text. Seven pages of
channel history (~180 posts) contain no post listing them. Reading them would
need OCR on a JPEG, which is a different and far less reliable project.

They are therefore still copied in by hand once a year, and
`.github/workflows/calendar-expiry.yml` runs monthly to say when that is due:
when any store has fewer than two future dates left, it messages the owner on
Telegram. The current lists end **2026-11-30**.

## 8. Other chains

`CATEGORIES` and the payload are chain-shaped, not HUMANA-shaped, but the anchors
and the `CHANNEL` constant are HUMANA's. Adding EconomClass or Світ means a
second channel and a second anchor set; the storage (`chain_feed` is keyed by
chain), the endpoint and the whole app side already handle more than one.
