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
**one-time bonus per signed store** (proposed **₴300–₴500** Featured, **₴800**
Spotlight — no recurring trailer). See [ADVERTISING.md](ADVERTISING.md) for the rate
card and how a sale is fulfilled. *Not active yet — the owner closes the first few
deals by hand to validate pricing, then hands selling to the agent.*

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
deal-of-week), and closes. Pay adds the one-time bonus per signed store. The owner
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
| `/cancel` | agent | abort the current survey |
| `/report` | owner | totals, per-agent counts, **estimated pay** |
| `/export` | owner | CSV of every logged visit |

Each submitted visit is also **pushed to the owner in real time** (photo +
summary) for spot-checking. Reconcile `/export` against poster photos and form
submissions before paying.
