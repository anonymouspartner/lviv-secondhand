# Telegram bot

A serverless Telegram bot (Cloudflare Worker) that surfaces the app's data in
chat. It lives in [`telegram-bot/`](../telegram-bot).

## Commands

| Command | What it does |
| --- | --- |
| `/start`, `/help` | Intro + command list (EN/UA) |
| `/today` | By-weight stores getting **fresh stock today** (fixed weekly restock day) |
| `/cheap` | **Best by-weight deals right now** — stores furthest into their weekly cycle |

Every result links back into the app with a `?store=<id>` deep link, so tapping
it opens that store's page, map pin, and price tracker.

## Why only by-weight stores drive `/today` and `/cheap`

The bot answers from **global** facts only. The by-weight (Світ-style) stores have
a **fixed weekly restock day** baked into the dataset, so "restocks today" and
"how many days into the cycle" are the same for everyone — the bot can state them
truthfully. For every other store, the delivery date is something each visitor
sets privately in their own browser (`localStorage`); that data never touches a
server by design, so the bot doesn't have it and never pretends to.

## How the data gets in (single source of truth)

The bot does **not** keep its own store list. At deploy time,
[`build-data.mjs`](../telegram-bot/build-data.mjs) extracts the `STORES` array
straight from [`index.html`](../index.html) and writes a slim `stores.gen.js`
(id, name, address, pricing, restock day, coordinates) that gets bundled into the
Worker. `stores.gen.js` is git-ignored — it's a build artifact, not a second copy
to maintain, and it is never served as a public JSON endpoint. Edit stores in
`index.html` as usual; the bot picks up changes on its next deploy.

## One-time setup

### 1. Create the bot
1. In Telegram, message [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Pick a name and username. BotFather gives you a **bot token** — keep it secret.
3. (Optional) `/setcommands` → paste:
   ```
   today - Stores restocking today
   cheap - Best by-weight deals right now
   help - What this bot can do
   ```

### 2. Pick a webhook secret
Generate a random string (this authenticates that requests come from Telegram):
```bash
openssl rand -hex 16
```
Add it as a repo secret **`WEBHOOK_SECRET`** (Settings → Secrets and variables →
Actions), alongside the existing `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

### 3. Deploy the Worker
Push to `main` (any change under `telegram-bot/` or `index.html`) or run the
**Deploy Telegram bot Worker** action manually. Note the deployed URL, e.g.
`https://lviv-tg-bot.<your-subdomain>.workers.dev`.

Locally instead, if you prefer:
```bash
cd telegram-bot
npm install
printf '%s' "<your WEBHOOK_SECRET>" | npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```

### 4. Register the webhook with Telegram

**Easiest — the workflow:** add your bot token as a repo secret
**`TELEGRAM_BOT_TOKEN`**, then run **Actions → “Register Telegram webhook” → Run
workflow** (the Worker URL is pre-filled). It calls `setWebhook` with the token
from the secret — never printed — and verifies with `getWebhookInfo`.

**Or by hand** — one-time `curl` (needs the bot token and the same secret):
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://lviv-tg-bot.<your-subdomain>.workers.dev" \
  -d "secret_token=<your WEBHOOK_SECRET>"
```
Verify:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```
`"url"` should show your Worker and `pending_update_count` should stay low.

### 5. Test
Message your bot `/today`, `/cheap`, `/help`. Health check in a browser:
`https://lviv-tg-bot.<your-subdomain>.workers.dev/` → "…bot is running."

## Security notes

- The Worker rejects any POST whose `X-Telegram-Bot-Api-Secret-Token` doesn't match
  `WEBHOOK_SECRET` (returns 401), so random internet traffic can't drive it.
- Replies are returned **inside the webhook response**, so the bot token is not
  stored in Cloudflare and never leaves your setup step.
- The bot is read-only: it reads no user data, writes nothing, and only ever
  replies to the chat that messaged it.

## Compliance

This bot uses the **official Telegram Bot API** and serves **our own** curated
dataset. It does not scrape, mirror, or republish other channels' content.
