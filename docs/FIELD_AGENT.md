# Field Agent Handbook · Довідник польового агента

How the Lviv Second Hand field agent surveys stores, advertises the app, records
each visit, and gets paid. Sections that the agent uses day-to-day are bilingual
(English / Українська).

> **Roles.** *Owner* = you (operates in English). *Agent* = the field
> representative in Lviv (operates in Ukrainian). *Sale model* = **survey &
> advertise** — the agent is paid per verified store visit, with a bonus when a
> visit produces a result (a QR poster placed, or an owner signed up).

---

## 1. The two bots · Два боти

| Bot | Purpose | Who |
|---|---|---|
| **@Secondhandlvivbot** | Log each store visit: `/visit` walks through store → GPS → photo → questionnaire. This is the record that pay is calculated from. | Agent |
| **capybara-bot** (private) | Day-to-day communication & notes between owner and agent. It translates English ↔ Ukrainian both ways, handles voice notes, and keeps a searchable memory (`/remember`, `/pin`, `/recap`). | Owner ↔ Agent |

**Rule of thumb:** *work* (each store) is recorded in **@Secondhandlvivbot**;
*talking* (questions, coordination, daily plan) happens in **capybara-bot**.

**Правило:** *робота* (кожен магазин) — у **@Secondhandlvivbot**; *спілкування*
(питання, координація, план на день) — у **capybara-bot**.

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
- **No double-pay:** re-visiting the same store in the same survey cycle doesn't
  earn a second base (it can still earn a bonus for a new poster/sign-up).
- **Pay cadence:** weekly. The owner runs `/report` (totals + estimated pay) and
  `/export` (full CSV), reconciles against poster photos / form submissions, and
  pays by the agreed method (cash or bank transfer, ₴ UAH).

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
1. Owner sends the day's target area/list in **capybara-bot**.
2. Agent brings a charged phone with location on, and printed **QR posters**
   (`marketing/qr-poster.pdf`).

**At each store / У кожному магазині**
1. Look at the storefront, go inside, be polite — you represent the app.
2. Briefly advertise: “Цей магазин є на безкоштовній карті секонд-хендів Львова —
   ось QR, покупці знаходять вас за годинами й цінами.” Offer to place a **QR poster**.
2. Опишіть коротко застосунок і запропонуйте розмістити **QR-плакат**.
3. In **@Secondhandlvivbot** send **/visit** and follow the steps:
   `store name → 📍 location → 📷 storefront photo → questions`. Submit ✅.
4. If the store isn't on the map yet, type `new <name>` at the first step.
5. If the owner/manager is interested, capture their contact and point them at the
   in-app **owner form** (or `/submit` in the bot) → that's a **bonus**.

**End of day / Наприкінці дня**
- Agent: quick summary in **capybara-bot** (areas done, issues, stores to revisit).
- Owner: `/report` to see the running total; `/export` weekly for the CSV.

---

## Updating the map: app vs Telegram · Оновлення карти

Two channels, split by what each does best.

**Structured store data → edit in the app → submit via GitHub.** Restock days,
opening hours, name changes, address, GPS, and notes are edited directly in **Lviv
Second Hand** (open a store → **Edit**; or add a store that isn't on the map from the
Map tab). To send the additions & corrections to the official map: **🤝 (top-right)
→ 🌍 Contribute to the official map → 🚀 Submit on GitHub**. That opens a **pre-filled
GitHub issue** on the repo; the owner reviews it and merges it into the map everyone
downloads.

> **The agent needs a free GitHub account** to post that issue (one-time signup at
> github.com — no coding, just a login). Map updates flow through **GitHub issues on
> the repo**, not by editing files. If a contribution is too large to fit in the
> issue, the app tells you to also **💾 Download file** and attach the
> `lviv-secondhand-stores.json` to the same issue.

**Which submission path?** Two buttons in the app both open a GitHub issue:
- **🌍 Contribute to the official map → 🚀 Submit on GitHub** — the agent's normal
  path. It carries the whole bundle of stores she **added or corrected** while
  surveying. Use this for survey data.
- **🏪 Own a store? → Submit your store** — a single-store form that asks for the
  submitter's **role + a contact to verify**. Use this only when signing up a real
  store **owner** (the ₴200 bonus): fill it *with* the owner so their role and contact
  are captured — that contact is the sign-up evidence. The owner can post it from
  their own phone (their GitHub account), or the agent posts it from hers.

**Photos, communication & live location → Telegram.** The app can't take photos,
chat, or share live position — Telegram does. Storefront photos and the GPS check-in
go through **/visit** in @Secondhandlvivbot; day-to-day questions, translation, voice
notes, and live-location sharing go through **capybara-bot**.

*Дані магазину (завезення, години, назва, адреса, GPS, нотатки) редагуються у
застосунку → **🚀 Submit on GitHub** (потрібен безкоштовний акаунт GitHub) → оновлення
йдуть через **GitHub issues** репозиторію. Фото, спілкування та жива геолокація — у
Telegram.*

### Found a store that isn't on the map yet? · Знайшли новий магазин?

Add it in the app, then submit it — it goes on the map for everyone once the owner
merges it.

1. App → **Map** tab → **Add store (＋)**.
2. Enter the **store name**.
3. **Tap the store's exact spot on the map** (or paste GPS coordinates) — pin it right
   on the storefront; do this **standing at the door** so the location is accurate.
4. Fill in what you know: **address, pricing type** (by-weight / itemized), **opening
   hours, restock day, notes**.
5. **Save** → "Store added!" (saved on your device).
6. Submit to the official map: **🤝 (top-right) → 🌍 Contribute to the official map →
   🚀 Submit on GitHub**. The owner reviews the GitHub issue and merges it.

- **Check first** that it's really not already on the map (search the name) so you
  don't add a duplicate.
- **Pin accuracy matters** — a pin far from the real storefront gets flagged for review.
- You still **log the visit** in `/visit` as usual (that's what pays); adding the map
  pin is a separate step so shoppers can find the store.

*Новий магазин: застосунок → **Карта → Додати магазин (＋)** → назва → **торкніться
точного місця на карті** (стоячи біля входу) → адреса, тип цін, години, день завезення,
нотатки → **Зберегти** → **🤝 → 🌍 Submit on GitHub**. Спочатку перевірте, що його ще
немає на карті. Візит усе одно фіксуйте через /visit.*

---

## The sales pipeline (why Phase 1 matters) · Воронка продажів

Every survey is quietly building a sales funnel. Track each store's stage in
**capybara-bot** (`/remember`, `/pin`):

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
| 1 | **Store** · Магазин | pick from the map, or `new <name>` |
| 2 | **Location** · Геолокація | share current GPS at the store |
| — | **Photo** · Фото | one clear storefront/entrance photo |
| 3 | **Pricing** · Тип цін | by weight / itemized / both / unknown |
| 4 | **Restock day** · День завезення | Mon–Sun / none / unknown *(by-weight only)* |
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

| Command | Who | Does |
|---|---|---|
| `/whoami` | anyone | replies with your numeric Telegram id (to be allow-listed) |
| `/visit` | agent | start a survey |
| `/myvisits` | agent | their running visit count |
| `/pay` | agent · owner | show the pay scheme (live rates from `RATE_VISIT`/`RATE_BONUS`) |
| `/cancel` | agent | abort the current survey |
| `/report` | owner | totals, per-agent counts, **estimated pay** |
| `/export` | owner | CSV of every logged visit |

Each submitted visit is also **pushed to the owner in real time** (photo +
summary) for spot-checking. Reconcile `/export` against poster photos and form
submissions before paying.
