# Барахолка — a bot-run resale market

A design, not a commitment. Nothing here is built.

Shoppers list their own second-hand items; the bot collects them, an owner
approves them, and they publish to the existing
[@Lviv_Secondhand](https://t.me/Lviv_Secondhand) channel, alongside the map's
own posts. **No payments, no escrow, no shipping** — see
[What this is not](#what-this-is-not).

---

## What this is not

Naming it early, because every marketplace decision below follows from it:

- **We never touch the money.** Buyer and seller arrange payment themselves,
  as every Ukrainian барахолка already does. There is no escrow to build and
  no refund policy to write. (Telegram Stars cannot be used regardless — it is
  digital goods only.)
- **We do not guarantee anything.** Not the item, not the seller, not the
  meeting. The rules say so in the seller's own language, on every surface.
- **We do not ship.** Handover is between the two people.
- **We are not a shop.** Bulk resellers are the fastest way to kill a
  барахолка, and the rules exclude them explicitly.

What is left is the part software is actually good at: structure, a
moderation gate, and getting stale listings off the feed.

## Surfaces

| Surface | Role |
| --- | --- |
| **The bot** (`@Secondhandlvivbot`) | The only way to post. `/sell` walks a seller through a listing. |
| **[@Lviv_Secondhand](https://t.me/Lviv_Secondhand)** | The feed — the same channel the map posts to. Bot-posted, forwardable, one item per post. |
| **Its linked discussion group** | Telegram auto-creates a thread per channel post; that is where buyers ask "ще актуально?" without DMs. |

### One channel, decided deliberately

Listings go into the **existing** map channel rather than a new one. The case
against was that the map channel's value is being low-volume and factual — at
most one post a day, every claim checked
([`TELEGRAM_CHANNEL.md`](TELEGRAM_CHANNEL.md)) — while listings are
high-volume user content.

The case for wins at this size: the channel has a handful of subscribers, and
a second channel starts from zero and needs its own cold start. Splitting a
small audience is a worse problem today than diluting a feed. Two costs come
with the choice:

1. **The feed can drown itself.** Accepted, not mitigated — see
   [No volume limits](#no-volume-limits--decided). The channel split is the
   remedy if it happens, not a throttle.
2. **A bad trade now happens under the map's name**, in front of the shops
   paying for placement. Handled by the moderation gate — which is no longer
   just a spam filter but the thing protecting the map's reputation — and by
   the disclaimer carried on every listing.

**Revisit when** listings crowd out the scheduled posts — the restock line
regularly buried is the signal to watch — or when the first serious dispute
lands. Splitting later is cheap: point the bot at a new channel id and leave
the old posts where they are.

**Not a topics supergroup**, though it is the obvious alternative. Topics
browse better; a channel forwards better, and forwarding is the whole growth
argument for being on Telegram at all. Categories are hashtags instead, which
Telegram searches within a channel.

### No volume limits — decided

An earlier draft capped listings at five a day, confined them to daytime, and
made them wait after a scheduled post. **The owner's decision is no limits:**
unlimited listings, published whenever they are approved, at any hour.

So nothing throttles the feed by design. Two mechanical consequences follow,
recorded here so that whoever reads this later knows they were chosen rather
than overlooked:

- **The approval gate is the only throughput limit.** Nothing publishes until
  the owner taps ✅, so the real ceiling is how fast approvals happen, not a
  number in a config. Removing the gate later removes the last limit with it.
- **The daily restock line can be buried.** It is the one post that is
  worthless once scrolled past — it exists to be read the evening before. A
  busy listing day pushes it up the feed like anything else.

If that becomes a problem, the fix is splitting the channel, not
reintroducing a cap: see the revisit trigger above.

### The discussion group affects the map posts too

Linking a discussion group turns on comments for **every** post in the
channel, the weekly ranking and store features included — not only listings.
That is mostly good (a store feature gaining a comment thread is fine) but it
is a change to the map channel's character, and it brings its own moderation
surface. It can be switched off again, but not selectively per post.

## Scope — what may be listed

**Clothing, footwear, and small items a person can carry to a meetup by hand.**
Sports equipment is explicitly in; furniture, appliances, vehicles and anything
needing a van are out.

The rule is deliberately about **size and handover**, not about a category
list. A category list has to be extended every time someone lists something
nobody thought of, and each extension is a moderation argument. "Could you
carry it to the meeting point?" answers every one of those without a
discussion, and it follows from the fact that we run no shipping and take no
part in the handover.

## Categories

Seven, and the last one is a catch-all rather than a room of its own. Every
extra category splits a small market into emptier shelves, so the long tail
goes in `Інше` instead of earning its own entry.

`👗 Жіноче` · `👔 Чоловіче` · `👟 Взуття` · `🧸 Дитяче` · `🎒 Аксесуари` ·
`⚽ Спорт` · `📦 Інше`

## The `/sell` flow

Four required steps, three skippable. Every extra required step loses sellers,
and a listing with a photo and a price is already useful.

| # | Step | Input | Required |
| --- | --- | --- | --- |
| 1 | Категорія | buttons (6) | ✅ |
| 2 | Фото | 1–4 photos, «Готово» to finish | ✅ |
| 3 | Що це | free text, ≤ 60 chars | ✅ |
| 4 | Ціна, ₴ | number | ✅ |
| 5 | Розмір | buttons: XS S M L XL / «Пропустити» | — |
| 6 | Стан | buttons: 10/10 … 6/10 / «Пропустити» | — |
| 7 | Район і як забрати | free text / «Пропустити» | — |
| 8 | Підтвердження | preview + «Опублікувати» — and the line naming both surfaces (see [Instagram](#instagram--every-listing-mirrored)) | ✅ |

`/cancel` exits at any step, and the hint repeats at every step — the bot
already does this everywhere else.

**A public `@username` is required.** The bot refuses at step 1 and explains
how to set one, because it is the only contact channel and relaying messages
through the bot would double the moderation surface for v1.

## The listing card

```
👗 Джинсова куртка Levi's
Розмір M · Стан 8/10
450 ₴

📍 Сихів · самовивіз
Продає @username

#жіноче
```

Everything comes from the wizard; there is no free-form block a seller can
fill with contacts, links or claims. Optional fields simply vanish when
skipped rather than printing «не вказано».

Because listings share a channel with the map's own posts, each one carries a
one-line mark so a reader never has to work out which kind of post they are
looking at — the same reasoning that puts «Не реклама» on an unpaid store
feature and «Реклама» on a paid one:

```
Оголошення від користувача · ми не беремо участі в угоді
```

## Moderation gate

Every listing is held as `pending` and sent to the owner as a photo with
inline ✅ / ❌ buttons. Approve publishes it to the channel; reject asks for a
one-tap reason that the bot relays to the seller.

This reuses the bot's existing owner-gated callback pattern rather than the
token-link approval the Instagram ads use — that exists because approval has
to cross from Telegram to a Worker over HTTP, which is not the case here.

**Approving every listing does not scale, and that is fine at the start.** It
is the cheapest possible spam filter while volume is low, and the point of the
pilot is to find out whether volume exists at all. Auto-approve for sellers
with N successful listings is the obvious later relaxation.

## Lifecycle — the part that decides whether this feels alive

Stale listings are what kill a барахолка. Someone messages about a jacket sold
three weeks ago, gets no reply, and stops trusting the feed.

- **30-day expiry.** The bot deletes the channel post and marks it `expired`.
- **Day 25: «Ще актуально?»** — one tap to extend 30 more days or close it.
- **`/sold`** (also the `✅ Продано` keyboard button) closes a listing
  immediately: the bot prefixes the channel caption with «🔴 ПРОДАНО» and the
  sweep removes the post a day later, so a buyer mid-conversation sees what
  happened instead of finding a hole.
- **`/my`** lists the seller's own listings — pending, live and just-sold —
  with their status.

Two things came out differently from the sketch above, both on purpose:

**A prefix, not strikethrough.** Strikethrough needs `parse_mode`, and the
caption carries seller-written text. Letting a seller's title render as markup
is the one thing this repo consistently refuses, so «🔴 ПРОДАНО» goes on as a
plain first line.

**The card is rebuilt, not re-read.** The `sold:` tap arrives on the picker
message in the bot chat, which has no caption, and a bot cannot fetch a message
it did not just send. So the new caption is rebuilt from the row the status
call returns — which is why `/api/listing/status` hands back the whole row and
not just an ok.

Ownership is checked in the bot, not the Worker: `/api/listing/status` is a
Worker-to-Worker call that the owner's approval uses too, so before a `sold:`
tap changes anything the bot confirms the id is in the tapping user's own
`/api/listing/mine` list and still `live`. A guessed id from a stranger, or a
second tap on something already closed, gets «Це оголошення не ваше або вже
закрите» and writes nothing.

## Instagram — every listing mirrored

Every approved listing also becomes its own Instagram post. Instagram cannot
*be* the market — captions carry no clickable link, so nobody can tap through
to a seller — but it is where people who have never heard of the channel are,
and every card says where the market is in text they can retype.

**The seller is told before they publish, not after.** The confirm step names
both surfaces outright: «Після перевірки воно з'явиться в каналі та в Instagram
(@secondhandlvivbot) — з фото, ціною і вашим @username». Instagram is a public
feed outside Telegram and outside our control once posted; publishing there on
the strength of «з'явиться в каналі» would be publishing something the seller
did not agree to. That consent is recorded on the row as `ig_ok = 1`, written
once at creation by the wizard that showed the line — so a listing made before
the wizard said anything can never be mirrored, however the code later changes.

**Two gates, both in the data**, checked by the workflow rather than assumed:

| Gate | Meaning |
| --- | --- |
| `status = live` | The owner approved it. Same human gate as the channel post. |
| `ig_ok = 1` | Its seller was told it goes to Instagram. |

**A rendered card, not the raw photo.** Three reasons, each sufficient:
Instagram accepts 4:5 to 1.91:1 and rejects everything else with a generic
container error — a phone photo is routinely 9:16, so raw photos would fail on
roughly every second listing, opaquely. A photo alone states no price, size or
district, and the caption is not clickable, so what a reader needs has to be
inside the image. And item photos sit in a feed of map posts: the frame, the
channel handle and «Оголошення користувача · ми не беремо участі в угоді» are
what tell a reader whose post this is. The photo itself is never cropped to
fit — it is contained over a blurred copy of itself, because cropping a garment
someone is trying to sell is the one failure that costs them the sale.

**How it runs.** The bot approves and posts to the channel itself, then sends a
`repository_dispatch` carrying the listing id and nothing else;
`.github/workflows/market-listing-ig.yml` re-reads the listing from the metrics
Worker, downloads the photo from Telegram, renders the card
(`tools/social/listing-card.mjs`), commits it — GitHub Pages serving the repo
root is how it gets the public URL Meta insists on fetching — and hands it to
the existing `instagram-post.yml`. Instagram is deliberately last and
best-effort: the channel is where the market lives, and a GitHub outage must
not cost a listing its publication.

**Known limit.** Instagram's publishing API allows 50 posts per rolling 24
hours. Since there is no cap on listings, a day with more than fifty approvals
would see the surplus fail in the workflow — the channel posts still go out,
and the failures show as red runs. Not worth a retry queue at this size; worth
knowing before it is.

## Anti-abuse

Per the decision above, there is **no cap on how many listings a seller posts
or how often**. What remains is not about volume:

| Control | Value | Why |
| --- | --- | --- |
| Public `@username` | required | Contact, and a thin identity check |
| Owner approval | every listing | The only thing standing between a flood and the channel |

With no rate limit, the gate carries the whole load. A seller can queue fifty
items in an evening; they simply arrive as fifty approvals to tap. Batch
approve/reject is the obvious thing to build first if that happens.

## Data — and whose database it is

**The bot Worker has no D1 binding.** It has KV (`VISITS`) for sessions and a
**service binding** to the metrics Worker (`METRICS`), which owns the database.
So the table lives in `worker/` and the bot reaches it through
`metricsFetch()`, exactly as the flash-deal subscriptions, edit claim/resolve
and the leaderboard already do.

This is not a stylistic preference. A Worker cannot fetch another Worker on the
same zone by its public URL — Cloudflare answers 404 with `error code: 1042` —
and this repo has already been bitten by it once, which is why `check-wiring.mjs`
fails CI on exactly that pattern. An earlier draft of this document said "one
new D1 table" without saying whose, which would have led straight into it.

One table, in the metrics Worker's `ensureSchema()`, since `check-wiring.mjs`
also fails CI on a D1 table written to but never created.

```sql
CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,
  seller_id       TEXT NOT NULL,
  seller_username TEXT NOT NULL,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  price_uah       INTEGER NOT NULL,
  size            TEXT,
  condition       TEXT,
  area            TEXT,
  photo_ids       TEXT NOT NULL,   -- JSON array of Telegram file_ids
  status          TEXT NOT NULL,   -- pending | live | sold | expired | rejected
  channel_msg_id  INTEGER,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  nudged_at       TEXT,            -- set when the day-25 "ще актуально?" was sent
  ig_ok           INTEGER          -- 1 = the seller was told it goes to Instagram
);
```

Photos are stored as Telegram `file_id`s, not re-hosted: Telegram keeps them,
and the bot can re-send by id indefinitely. The Instagram mirror is the one
thing that needs the bytes rather than the id, and it fetches them at post
time from Telegram — nothing here re-hosts a seller's photo.

## What already exists and gets reused

Almost all of the mechanism, which is why this is a plausible week rather than
a plausible quarter:

- **Step-wizard sessions** in KV with a TTL (`putSession`, `session.step`), and
  the `busySessionMsg` guard that stops two flows colliding.
- **Photo capture** in a wizard step — `/visit` already does it.
- **Reply keyboards and a universal `/cancel`.**
- **Owner-gated inline callbacks** (`handleAgentCallback`).
- **The scheduled sweep** in the metrics Worker, which already runs every five
  minutes — expiry and the day-25 nudge are another query on it, and it lives
  in the same Worker as the table.
- **`metricsFetch()`**, the bot's service-binding helper, with the strict
  variant that refuses to let an unreachable Worker look like an empty result.

## Rules — the pinned post

```
📌 Барахолка Львів — правила

1. Оголошення публікує лише бот: @Secondhandlvivbot → /sell
   Схвалене оголошення йде в канал і в Instagram.
2. Ми НЕ беремо участі в оплаті й НЕ гарантуємо угоди.
   Зустрічайтеся в людних місцях. Перевіряйте річ до оплати.
3. Одна річ — одне оголошення. Скільки завгодно оголошень.
4. Тільки вживане, для себе. Не для магазинів і не оптом.
5. Одяг, взуття та дрібні речі, які можна принести в руках
   (спортінвентар — так; меблі, техніка, авто — ні).
6. Заборонено: репліки як оригінал, нові речі.
7. Продали — кнопка «✅ Продано» або /sold.
   Свої оголошення — /my. Через 30 днів зникає саме.

Питання по речі — у коментарях під нею.
```

## Open questions

1. **Same bot or a new one?** Same reuses everything and keeps one entry
   point, but grows the command surface of what is currently a clean utility
   bot — and its persistent keyboard is deliberately the only navigation
   surface, so `/sell` means a new button there.
2. ~~**Does it share the brand?**~~ **Decided: yes** — listings go in the
   existing channel (see [One channel](#one-channel-decided-deliberately)).
   What stays open is the consequence: the first serious dispute happens under
   the map's name, so the moderation gate is now load-bearing rather than
   merely tidy.
3. **Who moderates on a bad week?** The gate is only as good as the person
   behind it, and this is a daily obligation, not a launch task.
4. **Seed supply.** An empty market is worse than none. Twenty listings before
   announcing it beats announcing and hoping.
