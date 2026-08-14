# Field Agent Handbook · Довідник польового агента

How the Lviv Second Hand field agent surveys stores, advertises the app, records
each visit, and gets paid. Sections that the agent uses day-to-day are bilingual
(English / Українська).

> **Roles.** *Owner* = you (operates in English). *Agent* = the field
> representative in Lviv (operates in Ukrainian). *Sale model* = **survey &
> advertise** — the agent is paid per verified store visit, with a bonus when a
> visit produces a result (a QR poster placed, or an owner signed up).

---

## 1. The bot · Бот

**@Secondhandlvivbot** — log each store visit: `/visit` walks through GPS →
store → photo → questionnaire. This is the record that pay is calculated
from.

Questions, coordination, and the daily plan — message the owner directly on
Telegram.

*Питання, координація та план на день — пишіть власнику напряму в Telegram.*

---

## 2. Payment scheme · Схема оплати

Two components. Numbers below are the **defaults** — adjust them in
`telegram-bot/wrangler.toml` (`RATE_VISIT`, `RATE_BONUS`); the bot's `/report`
uses the same numbers.

| Component | Default | Paid when |
|---|---|---|
| **Visit base** · база за візит | **₴80** | A visit is submitted in `/visit` with **GPS + storefront photo + full questionnaire**. One store = one base per survey cycle. |
| **Bonus** · бонус | **₴200 each** | A verifiable result: **QR poster placed** in the store (photo proof), or **owner signed up** (owner contact captured *and* they submit via the form / agree to be featured). Both can apply → two bonuses. |

> **Bonus vs. commission.** A **bonus** (above) is paid for the *action* — placing a
> poster or signing up a lead — **even if that store never buys**. A **sales
> commission** (Phase 2, below) is paid **only when a store actually subscribes and
> pays**. The bonus rewards effort and pipeline; the commission rewards revenue.
> *Бонус — за дію (плакат / лід), навіть якщо магазин не купить. Комісія — лише коли
> магазин підписується та платить.*

**Targets & guardrails**

- Suggested pace: **8–12 stores/day**. A realistic day ≈ ₴640–₴960 base, plus bonuses.
- A visit **only counts** if it has a real GPS reading, a clear storefront photo,
  and every question answered. Incomplete submissions don't count.
- The bot records **distance from the store's map pin**; visits far from the pin
  (or from a plausible new-store location) are flagged for the owner to review.
- **No double-pay:** the bot enforces this automatically — re-visiting the same
  store inside its own restock cycle doesn't earn a second base (it can still
  earn a bonus for a new poster/sign-up). The agent sees this at submit time,
  before it's sent.
- **Pay cadence:** weekly. The owner runs `/report` (totals + estimated pay) and
  `/export` (full CSV), reconciles against poster photos / form submissions, and
  pays by bank transfer (₴ UAH) to the card the agent has set with `/card`.

*Оплата: **₴80** за перевірений візит (GPS + фото + анкета) + **₴200** бонус за
результат (плакат розміщено або власник зареєструвався). Ціль: 8–12 магазинів/день.
Виплати — щотижня.*

**Phase 2 — when the agent also sells promotions.** On top of the visit base, a
**one-time sales commission per signed store** — paid only once the store actually
subscribes and pays (proposed **₴300–₴500** Featured, **₴800** Spotlight — no
recurring trailer). See [ADVERTISING.md](ADVERTISING.md) for the rate
card and how a sale is fulfilled. *Not active yet — the owner closes the first few
deals by hand to validate pricing, then hands selling to the agent.*

The agent can pull up this scheme anytime in @Secondhandlvivbot with **/pay** (it
shows the live rates from `RATE_VISIT` / `RATE_BONUS`).

---

## 3. Standard operating procedure · Порядок роботи

**Before the day / Перед виходом**
1. Owner sends the day's target area/list directly on Telegram.
2. Agent brings a charged phone with location on, and printed **QR posters** —
   pick these up from the owner in the city center.
3. In **@Secondhandlvivbot** send **/route** (or **/agent → 🧭 Route**), share
   your location, and get a walking order through the nearest stores — with a
   map link and turn-by-turn Google Maps directions. Optional, but it plans
   the day and avoids backtracking.

**At each store / У кожному магазині**
1. Look at the storefront, go inside, be polite — you represent the app.
2. Briefly advertise: “Цей магазин є на безкоштовній карті секонд-хендів Львова —
   ось QR, покупці знаходять вас за годинами й цінами.” Offer to place a **QR poster**.
2. Опишіть коротко застосунок і запропонуйте розмістити **QR-плакат**.
3. In **@Secondhandlvivbot** send **/visit** and follow the steps:
   `📍 location → store → 📷 storefront photo → questions`. Location comes first —
   the bot lists the nearest stores by GPS, since typing a name is slower and
   many stores share a near-identical name. Submit ✅.
4. If the store isn't on the map yet, type `new <name>` at the store-picking
   step (right after sharing location).
5. If the owner/manager is interested, capture their contact and point them at the
   in-app **owner form** (or `/submit` in the bot) → that's a **bonus**.

**End of day / Наприкінці дня**
- Agent: quick summary message to the owner directly (areas done, issues, stores to revisit).
- Owner: `/report` to see the running total; `/export` weekly for the CSV.

---

## Updating the map: app vs Telegram · Оновлення карти

Two channels, split by what each does best.

**Structured store data → edit in the app → send for review.** Restock days,
opening hours, name changes, address, GPS, and notes are edited directly in **Lviv
Second Hand** (open a store → **Edit**; or add a store that isn't on the map from the
Map tab). To send the additions & corrections to the official map: **🤝 (top-right)
→ 🗺️ Add to the official map**. That posts it to the owner, who gets a **Telegram
notification with ✅/❌ buttons**; approving it creates a GitHub issue automatically,
which the owner then merges into the map everyone downloads. **No GitHub account
needed** — the agent never touches GitHub directly.

**Which submission path?** Two different buttons in the app, both reviewed the
same way (Telegram approval → auto-filed GitHub issue):
- **🤝 → 🗺️ Add to the official map** — the agent's normal path. It carries the
  whole bundle of stores she **added or corrected** while surveying. Use this for
  survey data.
- **🏪 Own a store? → Submit your store** (from the share sheet) or **🔑 I own this
  store** (on an existing store's page, for claiming one already on the map) —
  use these only when signing up a real store **owner** (the ₴200 bonus): fill it
  *with* the owner so their role and contact are captured — that contact is the
  sign-up evidence.

**Photos, communication & live location → Telegram.** The app can't take photos,
chat, or share live position — Telegram does. Storefront photos and the GPS check-in
go through **/visit** in @Secondhandlvivbot; day-to-day questions and coordination
go directly to the owner on Telegram.

*Дані магазину (завезення, години, назва, адреса, GPS, нотатки) редагуються у
застосунку → **🤝 → 🗺️ Додати до офіційної карти** → власник отримує сповіщення в
Telegram і тисне ✅/❌ → після схвалення система сама створює GitHub issue. Акаунт
GitHub агенту не потрібен. Фото, спілкування та жива геолокація — у Telegram.*

### Found a store that isn't on the map yet? · Знайшли новий магазин?

Two ways to add it — pick whichever is faster in the moment.

**From the bot, while surveying (fastest):** in **/visit**, at the store-picking
step, type `new <name>` instead of a number. The survey still logs GPS + photo +
questionnaire as usual, and it's flagged **🆕 new** on the owner's push — but note
that this only records the *survey*; it does **not** put a pin on the map by
itself (the bot has no way to create a brand-new map entry). Follow up with the
app step below so the store actually appears for shoppers.

**From the app, to actually add the map pin:**
1. App → **Map** tab → **Add store (＋)**.
2. Enter the **store name**.
3. **Tap the store's exact spot on the map** (or paste GPS coordinates) — pin it right
   on the storefront; do this **standing at the door** so the location is accurate.
4. Fill in what you know: **address, pricing type** (by-weight / itemized), **opening
   hours, last delivery date, notes**.
5. **Save** → "Store added!" (saved on your device).
6. Submit to the official map: **🤝 (top-right) → 🗺️ Add to the official map**. The
   owner gets a Telegram approval prompt; approving it files the GitHub issue.

- **Check first** that it's really not already on the map (search the name) so you
  don't add a duplicate.
- **Pin accuracy matters** — a pin far from the real storefront gets flagged for review.
- You still **log the visit** in `/visit` as usual (that's what pays); adding the map
  pin is a separate step so shoppers can find the store.

*Новий магазин: найшвидше — у `/visit` на кроці вибору магазину напишіть `new
<назва>` (це фіксує візит, але НЕ додає пін на карту). Щоб додати пін: застосунок →
**Карта → Додати магазин (＋)** → назва → **торкніться точного місця на карті**
(стоячи біля входу) → адреса, тип цін, години, дата завезення, нотатки → **Зберегти**
→ **🤝 → 🗺️ Додати до офіційної карти**. Спочатку перевірте, що його ще немає на
карті. Візит усе одно фіксуйте через /visit.*

---

## The sales pipeline (why Phase 1 matters) · Воронка продажів

Every survey is quietly building a sales funnel. The owner tracks each store's
stage from the `/visit` notes and `/export` CSV:

`Prospected → Surveyed → Advertised (poster) → Interested (lead) → [owner closes] → Paying → Renewing/Churned`

Phase 1 gets **every** store to *Surveyed + Advertised*, and the promising ones to
*Interested* with a **captured owner contact** — that contact is exactly what an
owner sign-up bonus rewards, and it's the raw material Phase 2 sells against. So the
agent isn't "just surveying": they're generating qualified leads.

**Phase 2 — selling promotions (later).** Once pricing is validated, the agent pitches
the rate card ([ADVERTISING.md](ADVERTISING.md)) using a bilingual **sell-sheet**,
handles objections (small budget → start with a free trial or the à-la-carte
deal-of-week), and closes. Pay adds the one-time sales commission per signed store. The owner
approves any custom deal or price exception and fulfils the promo.

**What the agent is measured on:** verified visits/day, data completeness, posters
placed, app referrals, and **qualified leads** (owner contact + genuine interest) —
and, in Phase 2, signed promotions and their retention.

**Guardrails / ethics:** honest, low-pressure, respect the stores; photograph
storefronts and merchandise, **not people** (ask first); keep owner contacts private
and never resell them.

---

## 4. The questionnaire · Анкета (what `/visit` asks)

Kept short so a survey takes ~1 minute. The bot captures these; keep this list
and `QUESTIONS` in `telegram-bot/worker.js` in sync.

| # | Field | Answer |
|---|---|---|
| 1 | **Location** · Геолокація | share current GPS — the bot lists nearby stores by distance |
| 2 | **Store** · Магазин | pick a number from the nearby list, search by name, or `new <name>` |
| — | **Photo** · Фото | one clear storefront/entrance photo |
| 3 | **Pricing** · Тип цін | by weight / itemized / both / unknown |
| 4 | **Last delivery** · Останній завіз | Today / Yesterday / a date (e.g. `13.08`) / unknown — asked at **every** store, not just by-weight, since a date (unlike a weekday) works for any restock cycle |
| 5 | **Hours** · Години роботи | e.g. `10:00–20:00`, or “closed …” |
| 6 | **Size** · Розмір | S / M / L |
| 7 | **Poster placed?** · Плакат розміщено? | yes / no  → 💰 bonus |
| 8 | **Owner contact + consent?** · Контакт власника + згода? | yes / no  → 💰 bonus |
| 9 | **Notes** · Нотатки | anything useful, or “-” |

Auto-recorded with every visit: timestamp, agent, GPS, distance from the map pin,
and the photo.

---

## 5. Data & privacy · Дані та приватність

- The bot stores only what the survey needs (store, GPS, storefront photo,
  answers) in a private Cloudflare KV namespace; nothing is public.
- Photograph **storefronts and merchandise**, not people. Ask before photographing
  anyone; don't record names/phones without the person's OK (that's the point of
  the consent question).
- Owner contacts are collected only to invite the store onto the map — handle them
  respectfully and don't share them onward.

---

## 6. Owner setup & tallying · Налаштування власником

One-time enablement of the `/visit` subsystem is documented in
`telegram-bot/wrangler.toml` (create the `VISITS` KV namespace, set `BOT_TOKEN`,
`OWNER_ID`, `AGENT_IDS`, and the rates). After that:

`/agent` (agent · owner) opens a one-tap menu for the commands below; `/admin`
(owner only) opens one for `/report`/`/export`. Each command below also still
works typed directly — the menus are just a shortcut.

| Command | Who | Does |
|---|---|---|
| `/route` | agent | plan a walking route through the nearest stores (map link + Google Maps directions) |
| `/visit` | agent | start a survey |
| `/myvisits` | agent | their running visit count |
| `/card` | agent | set/view the payout card or IBAN `/report` pays out to |
| `/pay` | agent · owner | show the pay scheme (live rates from `RATE_VISIT`/`RATE_BONUS`) |
| `/job` | agent · owner | this handbook, as a link |
| `/cancel` | agent | abort the current survey |
| `/report` | owner | totals, per-agent counts, **estimated pay** |
| `/export` | owner | CSV of every logged visit |

Each submitted visit is also **pushed to the owner in real time** (photo +
summary) for spot-checking. Reconcile `/export` against poster photos and form
submissions before paying.
