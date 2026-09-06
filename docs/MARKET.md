# Барахолка — a bot-run resale market

A design, not a commitment. Nothing here is built.

Shoppers list their own second-hand items; the bot collects them, an owner
approves them, and they publish to a listings channel. **No payments, no
escrow, no shipping** — see [What this is not](#what-this-is-not).

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
| **A new listings channel** | The feed. Bot-posted, forwardable, one item per post. |
| **Its linked discussion group** | Telegram auto-creates a thread per channel post; that is where buyers ask "ще актуально?" without DMs. |

**A separate channel from [@Lviv_Secondhand](https://t.me/Lviv_Secondhand),
not a section of it.** The map channel's value is that it is low-volume and
factual — at most one post a day, every claim checked
([`TELEGRAM_CHANNEL.md`](TELEGRAM_CHANNEL.md)). Listings are high-volume
user-generated content. Merging them would destroy the cadence discipline and
attach every bad trade to the map's name. Both can sit in the existing
**Resale second hand** community, which is exactly what communities group.

**Not a topics supergroup**, though it is the obvious alternative. Topics
browse better; a channel forwards better, and forwarding is the whole growth
argument for being on Telegram at all. Categories are hashtags instead, which
Telegram searches within a channel.

## Categories

Six. Every extra category splits a small market into emptier rooms.

`👗 Жіноче` · `👔 Чоловіче` · `👟 Взуття` · `🧸 Дитяче` · `🎒 Аксесуари` ·
`🏠 Дім і текстиль`

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
| 8 | Підтвердження | preview + «Опублікувати» | ✅ |

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
- **`/sold`** closes a listing immediately; the bot edits the post to
  ~~struck-through~~ with «ПРОДАНО» and removes it a day later, so a buyer
  mid-conversation sees what happened.
- **`/my`** lists the seller's active items with close buttons.

## Anti-abuse

| Limit | Value | Why |
| --- | --- | --- |
| Active listings per seller | 5 | Bulk resellers, not individuals, hit this |
| New listings per hour | 1 | Flood control |
| Public `@username` | required | Contact, and a thin identity check |
| Owner approval | every listing (v1) | See above |

## Data

One table. The repo's `check-wiring.mjs` fails CI on a D1 table written to but
never created, so it goes in `ensureSchema()` with the rest.

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
  expires_at      TEXT NOT NULL
);
```

Photos are stored as Telegram `file_id`s, not re-hosted: Telegram keeps them,
and the bot can re-send by id indefinitely.

## What already exists and gets reused

Almost all of the mechanism, which is why this is a plausible week rather than
a plausible quarter:

- **Step-wizard sessions** in KV with a TTL (`putSession`, `session.step`), and
  the `busySessionMsg` guard that stops two flows colliding.
- **Photo capture** in a wizard step — `/visit` already does it.
- **Reply keyboards and a universal `/cancel`.**
- **Owner-gated inline callbacks** (`handleAgentCallback`).
- **The scheduled sweep** in the metrics Worker, which already runs every five
  minutes — expiry and the day-25 nudge are another query on it.

## Rules — the pinned post

```
📌 Барахолка Львів — правила

1. Оголошення публікує лише бот: @Secondhandlvivbot → /sell
2. Ми НЕ беремо участі в оплаті й НЕ гарантуємо угоди.
   Зустрічайтеся в людних місцях. Перевіряйте річ до оплати.
3. Одна річ — одне оголошення. До 5 активних.
4. Тільки вживане, для себе. Не для магазинів і не оптом.
5. Заборонено: репліки як оригінал, нові речі, не одяг/взуття/дім.
6. Продали — /sold. Через 30 днів оголошення зникає саме.

Питання по речі — у коментарях під нею.
```

## Open questions

1. **Same bot or a new one?** Same reuses everything and keeps one entry
   point, but grows the command surface of what is currently a clean utility
   bot — and its persistent keyboard is deliberately the only navigation
   surface, so `/sell` means a new button there.
2. **Does it share the brand?** A scam under the Lviv Second Hand name lands
   on the map and on the shops paying for placement. A separate name is safer
   and starts from zero audience.
3. **Who moderates on a bad week?** The gate is only as good as the person
   behind it, and this is a daily obligation, not a launch task.
4. **Seed supply.** An empty market is worse than none. Twenty listings before
   announcing it beats announcing and hoping.
