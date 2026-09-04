# The Telegram channel

The public channel is the second place everything gets posted, and — for a map
of shops in one city — probably the more important of the two.

Setup is three steps and about five minutes; nothing posts until you finish
them, and an unconfigured repo produces no failed runs.

Instagram's setup lives in [`INSTAGRAM.md`](INSTAGRAM.md). The strategy behind
having a channel at all is in [`SOCIAL_MEDIA.md`](SOCIAL_MEDIA.md).

---

## Why a channel, when the bot already exists

They reach different people. The **bot** talks to shoppers who already found the
project; the **channel** is the surface those people can forward. Three things
it does that Instagram cannot:

- **Links work.** A channel post's `https://www.lvivsecondhand.com/?store=s10`
  is tappable. On Instagram it is dead text, which is why every post there pays
  the "link in bio" tax.
- **Forwarding carries attribution.** Someone forwarding the week's ranking into
  a friends' chat brings the channel name with it. That is the growth mechanism.
- **Cross-promotion is a normal transaction.** Lviv city channels swap or sell
  posts to each other; there is no equivalent at that price on Instagram.

It is also cheaper to operate. No 60-day token to refresh, no container/publish
dance, no JPEG-only rule — one `sendPhoto` call with the `BOT_TOKEN` this repo
already holds.

---

## One-time setup

### 1. Create the channel

Telegram → **New Channel**. Make it **public** and give it a handle
(`@lvivsecondhand` or similar). A private channel works too, but then nothing
can be forwarded into public view, which is most of the point.

Use `marketing/instagram/avatar-*.png` as the photo — the same avatar as
Instagram, so the two read as one project.

### 2. Add the bot as an administrator

Channel → **Administrators → Add administrator** → search for your bot
(`@Secondhandlvivbot`) → grant **Post messages**.

This is the step that gets skipped, because adding the bot as a *member* looks
like it worked. It does not: Telegram accepts the token, resolves the channel,
and then refuses the post with `not enough rights` — at posting time, on a
schedule, where nobody is watching. The workflow pre-flights it (see below) so
that failure surfaces on demand instead.

### 3. Tell the repo where to post

**Settings → Secrets and variables → Actions → Variables → New repository
variable**, named `TG_CHANNEL`, value `@yourhandle`.

A **variable**, not a secret: a public channel handle is public by definition,
and this repo already keeps `OWNER_ID` as a plain var in `worker/wrangler.toml`
for the same reason. Duplicating public values into secrets is how this project
twice ended up with two names for one value, each holding something different.

If you made the channel private, put its numeric `-100…` id in a **secret**
called `TG_CHANNEL` instead — the workflow reads the variable first and falls
back to the secret.

`BOT_TOKEN` is already set from the bot's own deployment; nothing new is needed.

### 4. Check it without posting

**Actions → Post to the Telegram channel → Run workflow**, tick **`dry_run`**.

It resolves the channel, confirms the bot is an administrator with posting
rights, and confirms the image URL is live — then stops. Green means the next
scheduled post will work.

---

## What posts automatically

| When | What | Workflow |
| --- | --- | --- |
| Mondays ~07:00 Kyiv | The week's "longest since a restock" ranking — **only when the ranking actually moved** | `deals-image.yml` → `telegram-channel-post.yml` |
| Thursdays ~13:00 Kyiv | Store of the week — one shop, chosen by `pick-feature.mjs`, labelled *not an ad* | `instagram-feature.yml` → `telegram-channel-post.yml` |

Both mirror what goes to Instagram, from the same image and the same caption.
Each surface is its own job, so an expired Instagram token cannot stop the
channel post, and a misconfigured channel cannot stop the Instagram post.

Anything else goes out by hand: **Actions → Post to the Telegram channel → Run
workflow**, with an image path and a caption. Leave `image` empty to post text
only.

**Paid store ads are deliberately not mirrored here.** A store buys an
*Instagram* advertisement, and the approval you tap in Telegram approves that
one post. Posting it to the channel as well would deliver something nobody
bought and would put a second, unapproved copy of buyer-written text in public.
If it should become part of the product, sell it as part of the product.

---

## Cadence

A channel that posts more than about once a day gets muted, and a muted channel
is worse than a small one. The two automatic slots above are roughly right; add
a third only when you have something people would forward.

---

## Things that will bite

**The bot must be an administrator, not a member.** See step 2. The pre-flight
names this exact failure, so run a `dry_run` after any change to the channel's
admin list.

**Captions over 1024 characters.** Telegram's photo-caption limit is far shorter
than Instagram's 2200. Rather than truncate — which would drop the URL at the
end, the whole reason for posting here — the workflow posts the photo bare and
puts the full text in a reply underneath. The current captions are ~400–600
characters, so this is a guard, not a routine path.

**Nothing is retracted by deleting the file.** A post is live the moment the API
returns; removing the committed image later leaves the post in place with a
broken picture. Delete the post in Telegram.

**No `parse_mode`.** Captions can carry store-supplied fragments, and the same
rule the Worker's notifications follow applies here: without `parse_mode`, no
text can be made to render as markup and no post can be broken by an unbalanced
asterisk in a shop's name. Bare URLs still auto-link, so nothing is lost.
