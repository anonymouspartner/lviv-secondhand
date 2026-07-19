# 🧥 Lviv Second Hand Store Finder

A PWA (Progressive Web App) for finding and tracking second-hand clothing stores in Lviv, Ukraine.

**🔗 Live app:** https://anonymouspartner.github.io/lviv-secondhand/

No app store, no install required to use it in a browser — but adding it to your home screen gives you a fullscreen, app-like experience with one tap.

---

## 📲 Install on Android

1. Open **Chrome** on your phone
2. Go to https://anonymouspartner.github.io/lviv-secondhand/
3. Tap the **⋮** menu (top-right)
4. Tap **"Add to Home Screen"**
5. Tap **Add**
6. The app appears on your home screen and opens fullscreen 🎉

## 🍏 Install on iPhone

1. Open **Safari** (must be Safari, not Chrome)
2. Go to https://anonymouspartner.github.io/lviv-secondhand/
3. Tap the **Share** button (box with arrow, bottom of screen)
4. Tap **"Add to Home Screen"**
5. Tap **Add**

> ⚠️ On iOS, the Add to Home Screen option only works in Safari — Chrome on iPhone doesn't support PWA installs.

---

## ✨ Features

- 🗺️ **Map** of all second-hand stores in Lviv
- ⏱️ **Inventory cycle tracker** — counts days since last delivery, estimates current discounts
- ⚖️ Supports both **by-KG** and **itemized** stores
- 🌐 **EN / UA** language toggle
- ✅ Mark stores as **visited**
- ➕ **Add stores** missing from the map
- 🤝 **Share your map** & **contribute** additions/edits to everyone
- 📤 **Export** all store locations to Maps.me (KML)

## 🤝 Sharing & Contributing

Stores you add or edit are normally saved only on your own device. The **🤝 button** (top-right) lets you share them:

- **🔗 Copy share link** — sends your added & edited stores to anyone. When they open the link, your stores merge onto their map (duplicates are skipped automatically). You can also **download a file** or **copy a short code** instead.
- **📥 Import from others** — paste a link/code someone sent you, or load their `.json` file, to add their stores to yours.
- **🌍 Contribute to the official map** — opens a pre-filled [GitHub issue](https://github.com/anonymouspartner/lviv-secondhand/issues) with your additions and corrections. Once a maintainer merges it, your changes ship in the map everyone downloads. (A free GitHub account is needed to post.)

> Because the app is a static site with no server, peer sharing is instant and private, while contributions to the *official* map go through GitHub so a maintainer can review and merge them.

### For maintainers

Contributions arrive as GitHub issues labelled `map-contribution`. Each issue lists the added/edited stores in plain text plus a collapsible `json` block. To merge, copy the objects from the `custom` array into the `STORES` array in `index.html` (assign a stable `id`, fill in `hours`), and fold any `overrides` into the matching store's fields.

## 🗺️ Maps.me Integration

You can export every store on the map as a `.kml` file and import it straight into [Maps.me](https://maps.me):

1. In the app, tap the export button to download the `.kml` file
2. Open Maps.me → **Bookmarks** → **Import**
3. Select the downloaded `.kml` file
4. All stores now appear as bookmarks on your Maps.me map, even offline

---

# 🇺🇦 Lviv Second Hand — Пошук секонд-хендів

PWA (прогресивний веб-додаток) для пошуку та відстеження магазинів секонд-хенду у Львові.

**🔗 Посилання на застосунок:** https://anonymouspartner.github.io/lviv-secondhand/

Встановлення не обов'язкове — додаток працює у браузері, але якщо додати його на головний екран, він відкриватиметься на весь екран, як звичайний застосунок.

---

## 📲 Встановлення на Android

1. Відкрийте **Chrome** на телефоні
2. Перейдіть на https://anonymouspartner.github.io/lviv-secondhand/
3. Натисніть меню **⋮** (праворуч зверху)
4. Натисніть **«Додати на головний екран»**
5. Натисніть **Додати**
6. Застосунок з'явиться на головному екрані й відкриватиметься на весь екран 🎉

## 🍏 Встановлення на iPhone

1. Відкрийте **Safari** (саме Safari, не Chrome)
2. Перейдіть на https://anonymouspartner.github.io/lviv-secondhand/
3. Натисніть кнопку **«Поділитися»** (квадрат зі стрілкою, знизу екрана)
4. Натисніть **«На екран «Додому»»**
5. Натисніть **Додати**

> ⚠️ На iOS додавання на головний екран працює лише через Safari — Chrome на iPhone не підтримує встановлення PWA.

---

## ✨ Можливості

- 🗺️ **Карта** усіх секонд-хенд магазинів Львова
- ⏱️ **Трекер циклу завезення товару** — лічить дні з останньої доставки та оцінює поточні знижки
- ⚖️ Підтримка магазинів **на кіло** та **поштучно**
- 🌐 Перемикач мови **EN / UA**
- ✅ Позначення магазинів як **відвіданих**
- ➕ **Додавання магазинів**, яких немає на карті
- 🤝 **Поділитися картою** та **внести** доповнення/зміни для всіх
- 📤 **Експорт** усіх магазинів у Maps.me (KML)

## 🤝 Обмін і внесок

Магазини, які ви додаєте чи редагуєте, зазвичай зберігаються лише на вашому пристрої. Кнопка **🤝** (праворуч зверху) дозволяє поділитися ними:

- **🔗 Копіювати посилання** — надсилає ваші додані та змінені магазини будь-кому. Відкривши посилання, людина додає ваші магазини на свою карту (дублікати пропускаються). Також можна **завантажити файл** або **скопіювати короткий код**.
- **📥 Імпорт від інших** — вставте посилання/код, який вам надіслали, або завантажте файл `.json`, щоб додати їхні магазини до своїх.
- **🌍 Внести до офіційної карти** — відкриває попередньо заповнене [звернення на GitHub](https://github.com/anonymouspartner/lviv-secondhand/issues) з вашими доповненнями та виправленнями. Після того як супровідник їх додасть, ваші зміни з’являться на карті, яку завантажують усі. (Для публікації потрібен безкоштовний акаунт GitHub.)

> Оскільки застосунок — це статичний сайт без сервера, обмін між користувачами миттєвий і приватний, а внески до *офіційної* карти проходять через GitHub, щоб супровідник міг їх переглянути та додати.

## 🗺️ Інтеграція з Maps.me

Усі магазини на карті можна експортувати у файл `.kml` та імпортувати у [Maps.me](https://maps.me):

1. У застосунку натисніть кнопку експорту, щоб завантажити файл `.kml`
2. Відкрийте Maps.me → **Закладки** → **Імпорт**
3. Виберіть завантажений файл `.kml`
4. Усі магазини з'являться як закладки на вашій карті Maps.me, навіть офлайн
