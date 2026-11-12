# Visit attribution (`?src=`)

Every link we put somewhere else says where it was put, so the owner's stats
(bot → /admin → Visitors) can show which channels bring people.

The values live in one place, [`shared/attribution.mjs`](../shared/attribution.mjs),
imported by the bot, the metrics Worker and the build scripts. `index.html` and
the generated store/chain pages have no build step and carry their own copies;
[`scripts/check-attribution.mjs`](../scripts/check-attribution.mjs) fails CI if
they drift.

| `src` | Where the link is | Set by |
|---|---|---|
| `tgch` | Telegram channel posts (@Lviv_Secondhand) | `telegram-channel-post.yml` tags every link to our site in the caption just before posting, bare `www.lvivsecondhand.com` mentions included; `tools/social/restock-tomorrow.mjs` |
| `tgbot` | Telegram bot messages (@Secondhandlvivbot), including the subscriber flash-deal and restock alerts the metrics Worker sends through the bot | `telegram-bot/links.mjs` (`site()`, `storeLink()`), `worker/worker.js` (`subscriberLink()`) |
| `ig` | Instagram captions and the Instagram bio link | `tools/social/store-feature.mjs`, `instagram-ad.yml`. **The bio link is set by hand:** `https://www.lvivsecondhand.com/?src=ig` |
| `qr-<id>` | The printed QR poster for one store, e.g. `qr-c68` | `scripts/build-qr-posters.mjs` (`qrLink()`). Store ids are at most 4 characters today, so the longest tag is `qr-c100` (7 of the 16 allowed) |
| `share` | The app's "copy link to this store", "copy app link" and on-screen app QR | `index.html` (`withShareSrc()`) |
| `pwa` | Launches of the installed web app | `manifest.webmanifest` `start_url` |
| `twa` | Launches of the Android app | `index.html`, from the `LvivSecondHandApp` user-agent suffix the Capacitor shell adds (`native/capacitor.config.json`). Read from the user agent, not a start URL, so existing installs count without a new APK. Used only when no other tag arrived. |
| `flyer` | The QR on the shopper handout flyer (`marketing/flyer.pdf`) | `tools/social/flyer.mjs` |
| `sticker` | The QR stickers (`marketing/qr-stickers.pdf`) | `tools/social/qr-stickers.mjs` |
| `poster` | The generic in-store QR poster (`marketing/qr-poster.pdf`); per-store posters use `qr-<id>` | `tools/social/qr-poster.mjs` |
| `sellsheet` | The QR on the owner pitch / price sheet (`marketing/sell-sheet.pdf`) | `tools/social/sell-sheet.mjs` |

Anything that arrives with no tag is reported as `(none)`. Older rows tagged `tg` came from the daily restock channel post before it was renamed `tgch` (Nov 2026); read them as `tgch`.

## How it is read

`index.html` and every generated `/store/<id>/`, `/chain/<slug>/` and `/store/`
page read `?src=` the same way: at most 16 characters of `[A-Za-z0-9_-]`, kept
in `sessionStorage` (`lviv_sh_src`) for the tab, then stripped from the address
bar so a copied URL does not carry someone else's tag. Every metrics beacon
sends it, and the Worker stores it in `events.src`.

The static pages send one `page_view` beacon per view
(`key`: `store:<id>`, `chain:<slug>` or `store_index`). When a visitor arrived
with a tag, the page also adds it to its links into the map (`a[data-map]`), so
someone who goes on into the app keeps it.

Automated browsers send nothing: `navigator.webdriver`, or a user agent
matching `/bot|crawl|spider|headless|lighthouse|google-inspectiontool/i`.

## Never tagged

- `<link rel="canonical">`, `og:url`, `sitemap.xml`, and the links inside our
  own pages that Google crawls. The static HTML is always clean; the map-link
  tag above is added by script, for a visitor who already has one.
- Payment, billing and LiqPay URLs, `t.me` deep links, `mailto:` and `tel:`.
- Links *to* files rather than pages: the bot's links to the print PDFs under
  `marketing/`, and the QR image it sends. They run no beacon, so a tag would
  record nothing. (The QR codes printed *inside* those PDFs are tagged: see
  `flyer`, `sticker`, `poster`, `sellsheet` above.)
- Owner-only bot pings from the metrics Worker. The owner's own taps are not a
  channel.

Anything printed before tagging keeps working exactly as before and counts as
`(none)`: per-store QR posters encode `/?store=<id>`, and the flyer, stickers,
generic poster and sell sheet encode the bare site URL.

## Adding a tag

Add it to `SRC` in `shared/attribution.mjs` and to the table above. Lowercase,
`[a-z0-9-]`, at most 16 characters; `withSrc()` refuses anything else.
