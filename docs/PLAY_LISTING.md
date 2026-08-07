# Play Store listing — paste-ready copy

Everything you type into the Play Console **Main store listing** and **App
content** forms, in one place. Assets referenced here already live in the repo
(`icon-512.png`, `screenshots/`). Bilingual: fill English as the default
language and add Ukrainian as a translation (the app is EN/UA).

---

## Main store listing

### App name (≤30 chars)
- **EN:** `Lviv Second Hand`
- **UA:** `Секонд-хенд Львів`

### Short description (≤80 chars)
- **EN:** `Find & track Lviv's second-hand stores — map, hours & price-drop timing.`
- **UA:** `Секонд-хенди Львова: карта, години роботи та дні завезення.`

### Full description (≤4000 chars)

**EN**

```
Lviv Second Hand is the fastest way to find and track every second-hand and
thrift clothing store in Lviv — on one map, in your pocket.

WHAT YOU GET
• Map of second-hand stores across Lviv and nearby towns
• Show my location to see what's closest, with a live GPS toggle
• Opening hours for every store
• Inventory cycle tracker — record when a store last restocked and the app
  counts the days and estimates how deep the current discounts are
• Works for both by-weight (за вагу) and itemized stores
• Best-deal timing: know which by-weight stores are latest in their cycle today
• Mark stores as visited so you never double-check the same rail
• Follow a store to get an optional restock reminder
• Add, edit, and hide stores — and share your map with friends
• Full English / Ukrainian toggle
• Works offline once opened — no account, no ad networks, no personal tracking

WHY
Second-hand shopping in Lviv is a treasure hunt: prices drop day by day after
each delivery, and every shop restocks on its own schedule. This app turns that
into something you can actually plan around — so you show up when the racks are
fresh, or when they're cheapest.

PRIVACY
No accounts and no ad networks. What you add or track stays in your browser on
your device. Local shops can pay for a clearly-labelled placement on the map; it
is sold directly by us and nothing about you is used to choose what you see.
Only anonymous, aggregate usage is measured (cookieless), and your location is
used on-device only to center the map — it's never collected.
Full policy: https://www.lvivsecondhand.com/privacy.html
```

**UA**

```
«Секонд-хенд Львів» — це найшвидший спосіб знайти й відстежувати всі
секонд-хенди Львова на одній карті у вашому телефоні.

ЩО ВСЕРЕДИНІ
• Карта секонд-хендів Львова та довколишніх міст
• «Показати моє місцезнаходження» з живим перемикачем GPS
• Години роботи кожного магазину
• Трекер циклу завезення — позначте, коли був останній завіз, а застосунок
  лічитиме дні та оцінюватиме поточні знижки
• Працює і для магазинів на вагу, і для поштучних
• Найкращий час для покупки: які магазини на вагу сьогодні найдешевші
• Позначайте відвідані магазини
• Стежте за магазином і отримуйте нагадування про завезення (за бажанням)
• Додавайте, редагуйте та приховуйте магазини; діліться картою з друзями
• Повний перемикач мов English / Українська
• Працює офлайн після відкриття — без акаунтів, без рекламних мереж, без стеження

НАВІЩО
Секонд у Львові — це полювання за скарбами: ціни щодня падають після завозу, і
кожен магазин має власний графік. Застосунок допомагає це спланувати — приходьте,
коли завіз свіжий або коли найдешевше.

ПРИВАТНІСТЬ
Без акаунтів і рекламних мереж. Усе, що ви додаєте, лишається у вашому браузері
на пристрої. Місцеві магазини можуть оплатити чітко позначене розміщення на
карті — його продаємо безпосередньо ми, і для вибору того, що ви бачите, не
використовується жодна інформація про вас. Вимірюється лише анонімна статистика
(без cookie), а місцезнаходження використовується лише на пристрої для
центрування карти й ніколи не збирається.
Політика: https://www.lvivsecondhand.com/privacy.html
```

### Graphics
| Asset | File | Size |
| --- | --- | --- |
| App icon | `icon-512.png` | 512×512 |
| Feature graphic | `screenshots/feature-graphic-1024x500.png` | 1024×500 |
| Phone screenshots | `screenshots/01-list.png`, `02-store.png`, `03-share.png` | 1080×2160 |

### Categorization
- **App category:** Shopping
- **Tags:** map, shopping, local
- **Contact email:** (your support email)
- **Website:** https://www.lvivsecondhand.com/
- **Privacy policy:** https://www.lvivsecondhand.com/privacy.html

---

## App content answers (quick reference)

Full rationale is in [`PLAY_STORE.md`](PLAY_STORE.md) §5. Short version:

- **Privacy policy URL:** `https://www.lvivsecondhand.com/privacy.html`
- **Ads:** No.
- **App access:** All features available without login.
- **Content rating:** utility, no objectionable content → Everyone / PEGI 3.
- **Target audience:** general audience (18+ / not directed at children).
- **Data safety:**
  - *Collected:* anonymous app-interaction + page-view analytics (Cloudflare,
    cookieless) → collected, processed by Cloudflare, **not shared** for ads,
    **not used to track** across apps/sites.
  - *Restock notifications (opt-in):* push endpoint + followed store ids → a
    **Device or other IDs** item, collected for **App functionality** only, not
    shared, not for tracking, user-deletable by unfollowing.
  - *Location:* **used, not collected** — on-device only to center the map.
  - *Your added/edited stores, visits, settings:* stay on-device, not collected.

---

## Ship-today checklist (Internal testing track)

1. [ ] Play Console → **Create app** (name, English default, Free).
2. [ ] Upload the signed **`.aab`** to **Testing → Internal testing → Create release**.
3. [ ] Copy the **App signing key SHA-256** from **Setup → App signing** into
       `.well-known/assetlinks.json` (replace the placeholder), commit, let Pages
       deploy. This is what hides the address bar / verifies deep links.
4. [ ] Fill this listing (copy above) + the App content forms (answers above).
5. [ ] Add testers (email list or a Google Group), save, and share the opt-in link.
6. [ ] Install from the link on a real phone → confirm the URL bar is hidden
       (= asset links verified) and the site loads.

Production rollout follows once the account is eligible (see `PLAY_STORE.md` §6
and the account note in chat).
