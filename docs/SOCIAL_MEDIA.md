# Social media — where to expand next

A brainstorm, not a commitment. This doc lays out what is worth doing, what it
would cost, what to build so it stays cheap, and what to deliberately skip.

> **Shipped since this was written:** the Telegram channel mirror (§3A), the
> weekly store-of-the-week slot (pillar 2), and the daily restock line
> (pillar 4). Setup for the channel is in
> [`TELEGRAM_CHANNEL.md`](TELEGRAM_CHANNEL.md). The rest of this document is
> still a proposal.

Instagram's own setup and mechanics stay in [`INSTAGRAM.md`](INSTAGRAM.md); paid
store placements stay in [`ADVERTISING.md`](ADVERTISING.md). This is the layer
above both: which channels, which content, in what order.

---

## 1. Where we actually are

| | Status |
| --- | --- |
| Instagram [@secondhandlvivbot](https://www.instagram.com/secondhandlvivbot/) | Two automatic posts/week (Monday deals ranking, Thursday store of the week), plus ~12 evergreen images posted by hand |
| Telegram **channel** | ✅ Built — two mirrored posts plus a channel-only daily restock line. Needs one `TG_CHANNEL` variable to go live |
| Telegram **bot** | A product, not a channel — reaches people who already found us |
| Web push | Built, opt-in, same problem: existing users only |
| Facebook / TikTok / Threads / YouTube | Nothing |
| Video of any kind | Nothing |
| Owned audience off-platform | None (no email list, no channel) |

**The bottleneck is not content.** `stores.json` generates content endlessly —
126 stores, restock cycles, per-store hours, a live "longest since restock"
ranking. The bottleneck is **distribution and format**:

1. **A static feed post is close to invisible now.** Instagram's discovery surface
   is video and shares. A 1080×1350 JPEG reaches the followers we already have,
   which is the audience we are trying to grow. It is a retention format doing a
   job it cannot do. (The channel mirror fixes the *link* problem, not this one.)
2. **The audience for a Lviv second-hand map is not on Instagram hashtags.** It is
   in Telegram city channels, Facebook barahoLka/секонд groups, and university
   chats. We are publishing where it is convenient, not where they are.
3. **Every post is one-directional.** Nothing we publish asks anyone for anything,
   so nothing compounds. No shares loop, no UGC loop, no referral loop.

---

## 2. The thesis

> **Post the data, not opinions about the data.**

The unfair advantage is a dataset nobody else in Lviv has: which store restocked
when, which is furthest into its cycle, who opens tomorrow at nine. That converts
into content that is *true this week and different next week* — which is exactly
what an algorithm rewards and what a person forwards to a friend.

Two corollaries that should govern every decision below:

- **If a post can't be regenerated from data, it costs owner time forever.** Prefer
  formats a script can re-render. This is already the house style (`deals-image.mjs`
  reads the live ranking; `promo.mjs` reads live store counts) — extend it.
- **Never bake a price into an image.** Existing rule, and it holds across every new
  channel: per-kg rates differ per store and move with the exchange rate. Days
  since restock is the durable number.

---

## 3. Channel expansion, ranked

### A. Telegram **channel** — ✅ built

A public broadcast channel (distinct from the bot), e.g. `@lvivsecondhand`.

**Why it is the highest-return move here.** Ukraine's default social layer is
Telegram, not Instagram. Three concrete advantages over IG for this product:

- **Links are clickable.** Every Instagram post is a dead end — "link in bio" is a
  tax we pay on every single post. A channel post links straight to
  `?store=s10`. This alone probably doubles conversion per view.
- **Forwarding is the growth mechanism** and it carries attribution back to the
  channel. Someone forwarding "Bomba has gone 6 days" into a friends' chat *is* the
  distribution.
- **Cross-promotion is a normal, cheap transaction.** Lviv city channels sell or swap
  posts. There is no Instagram equivalent at that price.

**Cost to build: near zero, and now spent.** `telegram-channel-post.yml` takes the
same inputs as the Instagram poster, so the Monday and Thursday pipelines each mirror
with one extra `uses:` job. It no-ops green until `TG_CHANNEL` is set —
[`TELEGRAM_CHANNEL.md`](TELEGRAM_CHANNEL.md) is the three-step setup.

**What it carries today:** the Monday ranking, the Thursday store feature, and the
daily "who restocks tomorrow" line — the last of which is channel-only, because it
stops being useful the next morning and a tappable link is most of its value.
**Not yet wired:** new stores as they land, and flash deals (already broadcast to bot
subscribers; the channel would be the public, forwardable version). Paid ads are
deliberately excluded — a store bought an Instagram post, and the approval covers
that one post.

**Watch out:** a channel that posts more than ~1×/day gets muted. Daily restock
line + Monday ranking is about right; hold everything else.

### B. Short video — the only real discovery surface

Reels / TikTok / Shorts are one asset shown in three places. Two production routes,
and they answer different questions:

**B1. Programmatic video — no filming.** The generators already rasterize HTML
through Playwright. Playwright can also record a screencast, so an animated version
of the existing templates (the ranking counting up, the price tag falling, pins
dropping onto the map one per store) is a **new script, not a new pipeline** —
`tools/social/reel.mjs`, maybe a day of work. Ceiling is real but limited: motion
graphics perform far below footage of actual things.

**B2. Field video — the actual advantage, and it is already staffed.** The field
agent visits ~40 stores a week (see [`FIELD_AGENT.md`](FIELD_AGENT.md)). Every one of
those visits is standing inside a second-hand shop on restock day. A 10-second
vertical clip — the rail, the crowd at the door at opening, the tag, the street
outside — is content nobody else can produce, and it costs the visit that is
already happening.

This is the single biggest unlock in this document. It needs three things that are
not code: the agent's consent to film, each store's permission, and a phone-shot
standard low enough that it actually happens (vertical, 10s, no talking required).
Add a "clip" checkbox and an upload step to the `/visit` flow and it becomes part
of the existing survey rather than an extra chore. **Pay per usable clip**, same
shape as the existing per-visit rate.

**Format ideas that survive without a presenter:** silent B-roll + on-screen
Ukrainian text + trending audio; "day 1 vs day 6 of the same rail"; the door at
10:00 on restock day; three stores in 15 seconds.

**Watch out:** filming people in shops needs the store's OK — get it during the
survey, and never film customers' faces. A store that says no is still a store on
the map; do not let filming leak into the free-listing relationship.

### C. Facebook — the Page is free, the Groups are the point

- **A Page** costs almost nothing: Instagram cross-posts to it natively. Do it for
  completeness and for the older half of the audience, expect little.
- **Groups are where the shoppers actually are.** Lviv барахолка / секонд-хенд /
  «Львів оголошення» groups have real, active, exactly-right audiences.

**Groups must be posted by a human, occasionally, in a helpful register** — "made a
free map of every second-hand in Lviv with restock days, no ads, no signup" once
per group, then answer questions in comments. **Never automate this.** Automated
group posting gets the account banned and the project labelled spam in the one
community that matters most.

### D. Threads — cheap side-effect, unproven

Same Meta account, the caption already exists, the text is short. Worth ~zero
effort as a mirror of the Telegram channel's text posts. Do not build anything for
it; if a cross-post is not close to free, skip it.

### E. Deliberately skipping (for now)

| Channel | Why not |
| --- | --- |
| **YouTube long-form** | Production cost is an order of magnitude above the rest for an audience that is not searching for this |
| **Pinterest** | Wrong geography, wrong intent — thrift content there is US/UK styling, not "which Lviv shop restocked" |
| **X / Twitter** | Negligible Ukrainian local-commerce audience |
| **Reddit** | One good `r/lviv` post is worth making; it is not a channel to maintain |
| **Paid ads (Meta)** | Not until organic proves a message converts. Buying reach for an unproven post is how budgets disappear |

### F. Not social, but competes for the same hours

Worth naming so the comparison is honest — these may beat channels D–E:

- **Google Maps / local SEO.** People search "секонд хенд Львів" on Maps with the
  highest intent that exists anywhere in this funnel. A Google Business Profile plus
  per-store pages that already exist (`/store/*`) is likely a better hour than Threads.
- **Paid placement in a big Lviv Telegram channel.** Cheap, instant, and measurable
  with a `?src=` link. Probably the fastest way to find out whether the product's
  pitch lands at all.
- **University chats (УКУ, ЛНУ, Політехніка).** The exact demographic, reachable in
  a way that costs nothing but a well-worded message to an admin.

---

## 4. Content pillars

Five recurring slots. Each names what generates it, so the calendar is a build list
rather than a wish list.

| # | Pillar | Source | Cadence | Exists? |
| --- | --- | --- | --- | --- |
| 1 | **The cycle** — who has gone longest without a restock | `deals-image.mjs` | Monday | ✅ automatic |
| 2 | **Store of the week** — one shop, hours, restock day, honestly labelled not-an-ad | `store-feature.mjs` + `pick-feature.mjs` + `instagram-feature.yml` | Thursday | ✅ automatic |
| 3 | **What's new on the map** — stores added since last time | *(new)* diff of `stores.json` | Monthly | ❌ |
| 4 | **Restock tomorrow** — one line, who to be at when they open | `restock-tomorrow.mjs` + `restock-tomorrow.yml` | Daily, Telegram only | ✅ automatic |
| 5 | **How the cycle works** — education: why day 6 is cheaper than day 1, per-kg vs per-item | evergreen, written once | Every ~2 weeks | ❌ |

Plus two loops that are not slots but changes in posture:

- **6. Find of the week (UGC).** Ask for what people found — repost with credit.
  This is the cheapest growth mechanism available and the only one that makes
  followers do the work. Needs nothing but a call to action and a repost habit.
- **7. Behind the scenes.** The agent job posting, a survey being filled in, the
  map growing. Doubles as recruitment (`/apply` already exists) and is the kind of
  post that makes a project look alive rather than automated.

### Twenty posts already sitting in the data

The point of the thesis in §2 is that this list writes itself. All of these are
queries against files already in the repo:

1. The Monday ranking (live).
2. "Only these N shops are open on Sunday." — `hours`
3. "Restocking tomorrow: …" — `restockDay`
4. "8 chains, 49 independents — and the independents restock a day sooner on average (8.4 vs 9.6)." — `brand` + `cycle`
5. "Every shop within 10 minutes of Rynok." — `lat`/`lng`
6. "Sold by weight, not by item: N shops." — `pricing`
7. "Opens at 9 — the five earliest doors in the city."
8. "The map just passed 130 stores." — milestone from the count
9. "Newly added this month: …" — git diff of `stores.json`
10. "The longest-cycle shop in Lviv restocks every N days." — `cycle`
11. "Three shops on one street." — address clustering
12. "Day 1 vs day 6 on the same rail." — video
13. "What our field agent does in a day." — `FIELD_AGENT.md`
14. "How to read a second-hand price cycle." — explainer
15. "Per-kilo, explained — why we never print the rate." — explainer
16. "The map at night" — the store-owner pitch (`stories.mjs` already renders it)
17. "No account, no tracking, free." — `promo.mjs` post 4
18. "Found something good? Show us." — UGC prompt
19. "Own a shop? You're already on the map, free." — owner acquisition
20. "Flash deal, 3 hours left." — the live flash-deal path

---

## 5. What to build so this stays cheap

Ordered by return per hour. Everything here matches the existing pattern: a script
in `tools/social/`, a workflow that runs it, output committed and served by Pages.

| Build | What it does | Rough size |
| --- | --- | --- |
| ✅ **`telegram-channel-post.yml`** | Mirrors any image we publish to the Telegram channel via `sendPhoto`. Reuses `BOT_TOKEN`. | Done |
| ✅ **Schedule `instagram-feature.yml`** | Store-of-the-week goes out weekly, picking a store that is not paid-for, not thin, and not recently featured | Done |
| **`?src=` on every posted link + pass-through in the Worker** | Per-channel attribution against the existing `store_open` metric. Without this the whole exercise is unmeasurable | Hours |
| **`restock-tomorrow` job** | Daily one-liner to the channel from `restockDay`/`restockDates` | Half a day |
| **`captions.mjs`** | One place for caption templates + hashtag sets per channel, so captions stop being retyped per post | Half a day |
| **`whats-new.mjs`** | Renders "added this month" from a `stores.json` diff | Half a day |
| **`reel.mjs`** | Playwright screencast → MP4 from the existing HTML templates | ~A day |
| **Clip upload in `/visit`** | The field agent submits a 10s vertical clip with the survey; clips land somewhere the owner can review | ~A day, plus policy |

**Do the attribution one early.** Everything else is guesswork without it, and it is
the smallest item on the list.

---

## 6. Measuring it

One number per channel, checked monthly. Not impressions — impressions are the
metric that makes a dead account look alive.

| Channel | The number that matters |
| --- | --- |
| Telegram channel | Subscribers, and forwards per post |
| Instagram | Saves + shares (not likes), profile→link taps |
| Video | Watch-through, then follows per 1k views |
| Facebook groups | Comments and clicks per post, not reach |
| All | `store_open` events tagged with `?src=` — the only cross-channel truth |

The Worker already records `store_open`; adding a source tag makes the map's own
analytics the scoreboard for social, which is better than any platform's dashboard
because it counts the thing we actually want (someone looking at a shop).

**A blunt kill rule:** any channel that has not produced measurable link taps after
8 weeks of honest effort gets dropped, not "improved". The list in §3E is already
long; it should stay long.

---

## 7. Guardrails

- **Paid placements are always labelled** — `Реклама / Sponsored`, on every surface
  including new ones. The app promises shoppers this; a new channel does not get an
  exemption. Store features that are *not* paid must keep saying so, as
  `store-feature.mjs` already does.
- **No prices in images.** Days since restock, never ₴/kg. (See §2.)
- **Don't repost an unchanged ranking.** `deals-image.yml` already refuses; keep that
  rule when the same content mirrors to new channels.
- **Never automate group or DM posting.** Bans, and worse, reputation.
- **Store photos need the store's permission**, gathered during the visit.
- **Token expiry is the standing failure mode.** Every new API channel needs the same
  treatment as `instagram-token-check.yml`: an automated check that turns a silent
  outage into a Telegram message.
- **Ukrainian first.** Captions in Ukrainian; English only where the audience is
  clearly not local.
- **One voice.** The existing register — plain, factual, slightly dry, no hype, no
  emoji spam. It is why the map reads as trustworthy; it should survive TikTok.

---

## 8. Sequence

**First 30 days — cheap and mostly automatic**
1. ✅ Mirror the Monday post to a channel, ✅ add the daily restock line.
   **Left to do:** open the channel and set `TG_CHANNEL` — all of it is inert
   until then.
2. Add `?src=` and the Worker pass-through so everything after this is measurable.
3. ✅ Schedule store-of-the-week.
4. Post once, by hand, in three Facebook groups and once in `r/lviv`. Watch what happens.

**Days 30–60 — find out whether video works**
5. `reel.mjs`, and ship 4–6 programmatic videos to Reels + TikTok.
6. Settle the filming policy with the agent and the stores; collect the first clips.
7. Start the UGC ask ("find of the week") on every channel.

**Days 60–90 — commit or cut**
8. Compare `src`-tagged store opens per channel; drop whatever produced nothing.
9. If video worked, make the field clip a paid, standard part of every visit.
10. Only then consider paid placement — in a Lviv Telegram channel, not on Meta.

---

## 9. Open questions for the owner

These decide the shape of the above and cannot be answered from the repo:

1. **Who makes video, and is anyone willing to be on camera?** A face outperforms
   motion graphics by a wide margin, and it is a personal decision, not a tactical one.
2. **Can the field agent film, and will stores agree?** This is the difference between
   plan B1 and plan B2 — between decent and unmatched.
3. **How many hours a week does this get?** The channel list scales down cleanly; the
   §8 sequence assumes a few hours weekly, not a full-time content operation.
4. **Any budget for cross-promotion?** A few hundred ₴ in the right Lviv Telegram
   channel likely beats every organic hour in this document, and answers "does the
   pitch land" in a week.
5. **Is the account brand or person?** `@secondhandlvivbot` reads as a utility. A
   named human account grows faster and carries a cost — it cannot be handed off.
