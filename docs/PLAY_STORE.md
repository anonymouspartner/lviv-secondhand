# Shipping Lviv Second Hand to Google Play

This app is a Progressive Web App (PWA). You don't rewrite it for Android —
you wrap the existing site in a **Trusted Web Activity (TWA)** and upload that
to Google Play. This guide is the end-to-end checklist.

> **Status of the code side:** the PWA already meets the technical bar for a
> TWA — HTTPS hosting, a web app manifest with maskable icons and screenshots,
> and a service worker for offline use. The repo also ships an
> `.well-known/assetlinks.json` template and Play-ready screenshots under
> `screenshots/`. What remains is packaging + Play Console paperwork, plus one
> hosting decision (below).

---

## 0. The one real blocker: Digital Asset Links + hosting

A TWA hides the browser address bar only if the website and the Android app
verify each other through a file served at the **origin root**:

```
https://<your-origin>/.well-known/assetlinks.json
```

The app currently lives at a **subpath**: `anonymouspartner.github.io/lviv-secondhand/`.
On GitHub Pages you can only control `/.well-known/` at the origin root if you
own the `anonymouspartner.github.io` **user repo** — a project page can't place
a file at the domain root.

**Recommended fix: use a custom domain** (e.g. `lvivsecondhand.com`):

1. Buy a domain.
2. In the repo: **Settings → Pages → Custom domain**, set your domain; GitHub
   writes a `CNAME` file and provisions HTTPS.
3. Point the domain's DNS at GitHub Pages (A/AAAA records for the apex, or a
   CNAME to `anonymouspartner.github.io` for a subdomain).
4. Because the app is served at the domain root, the repo's
   `.well-known/assetlinks.json` is now reachable at
   `https://your-domain/.well-known/assetlinks.json`. ✅

If you skip the custom domain, the app can still be wrapped, but it will show a
browser address bar and Google is more likely to reject it as a low-value
webview wrapper.

---

## 1. Prerequisites

- [ ] **Google Play Developer account** — one-time \$25, at
      https://play.google.com/console (identity verification can take a few days).
- [ ] A **custom domain** on the site (see section 0), strongly recommended.
- [ ] Node.js installed locally (for Bubblewrap), or just use PWABuilder in the
      browser.

---

## 2. Generate the Android app (two options)

### Option A — PWABuilder (easiest, browser-based)

1. Go to https://www.pwabuilder.com and enter your site URL.
2. It reads `manifest.webmanifest`, scores the PWA, and lets you **Package for
   Stores → Android**.
3. Choose the **Trusted Web Activity** package. Set:
   - **Package ID** (e.g. `com.anonymouspartner.lvivsecondhand`) — write this
     down; it goes in `assetlinks.json`.
   - App name, launcher name, theme color `#1b5e38`, background `#14472a`.
4. Download the zip. It contains the signed `.aab`, a
   `signing-key-info.txt`/keystore, and a ready-made `assetlinks.json`
   **with the real SHA-256 fingerprint already filled in**.

### Option B — Bubblewrap (CLI, more control)

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://your-domain/manifest.webmanifest
bubblewrap build
```

It prompts for the package name and generates a keystore + `.aab`. Get the
fingerprint any time with:

```bash
bubblewrap fingerprint
# or:
keytool -list -v -keystore android.keystore -alias android -storepass <pw>
```

> **Keep your keystore + passwords safe and backed up.** Losing them means you
> can never update the app under the same listing.

---

## 3. Wire up assetlinks.json

1. Take the **package name** and **SHA-256 fingerprint** from step 2.
2. Edit `.well-known/assetlinks.json` in this repo, replacing the two
   `REPLACE_WITH_...` placeholders.
3. Commit and let GitHub Pages deploy.
4. Verify it's live and correct:
   - Visit `https://your-domain/.well-known/assetlinks.json` (must return the
     JSON, `Content-Type: application/json`).
   - Test with Google's tool:
     `https://developers.google.com/digital-asset-links/tools/generator`

> If you also enable **Play App Signing** (recommended, and the default), Play
> re-signs the app with its own key — so add **that** SHA-256 (from Play
> Console → Setup → App signing) to `assetlinks.json` too. It's fine to list
> multiple fingerprints.

---

## 4. Play Console — create the app & store listing

In https://play.google.com/console → **Create app**:

- **App name:** Lviv Second Hand
- **Default language:** English (add Ukrainian as a translation — the app is bilingual)
- **App or game:** App · **Free**

### Store listing assets (already generated in this repo)
- [ ] **App icon** 512×512 — use `icon-512.png`.
- [ ] **Feature graphic** 1024×500 — *not yet generated; ask and I can make one.*
- [ ] **Phone screenshots** (2–8, min 320px) — use `screenshots/01-list.png`,
      `02-store.png`, `03-share.png` (1080×2160).
- [ ] **Short description** (≤80 chars), e.g.
      *"Find & track Lviv's second-hand stores: map, hours, and price-drop timing."*
- [ ] **Full description** — see `README.md` features for source copy.

---

## 5. Play Console — required declarations

### Privacy policy
- [ ] Link `https://your-domain/privacy.html` in **Store settings → Privacy policy**.

### Data safety form (App content → Data safety)
This app is privacy-friendly; answer honestly:
- **Does your app collect or share user data?** No data is collected or sent to
  you — all user content (added/edited/hidden stores, visits, settings) stays in
  the browser's local storage on the device.
- **Location:** the app *uses* approximate/precise location (the "Show my
  location" feature) but does **not** collect, store, or transmit it — it's used
  only on-device to center the map. Declare it as **used, not collected/shared**.
- **Data handling:** processed on-device; not shared with third parties.
- Note in your own words that opening the app contacts GitHub Pages (hosting)
  and OpenStreetMap (map tiles), which see the device IP like any website —
  this matches `privacy.html`.

### Content rating (App content → Content ratings)
- Complete the IARC questionnaire. This is a utility with no objectionable
  content → expect **Everyone / PEGI 3**.

### App access, ads, target audience
- **Ads:** No.
- **App access:** all functionality available without login.
- **Target audience:** general audience (not directed at children).

### Permissions
- The only sensitive capability is **location**, requested at runtime by the
  browser engine when the user taps 📍. No Android permission declarations are
  needed beyond what Bubblewrap/PWABuilder sets.

---

## 6. Release

1. Start with a **Closed or Internal testing** track to smoke-test the `.aab` on
   a real device (confirm the address bar is hidden = asset links verified).
2. Fill every **Dashboard** task until the "Production" release is unblocked.
3. Roll out to **Production**. First review typically takes a few days.

---

## 7. Updating later

- **App content/logic:** just update the website (merge to `main`). TWA loads
  the live site, so users get changes on their next online launch — **no Play
  update needed** for web changes.
- **You only need a new `.aab`** when you change the Android wrapper itself
  (package name, min SDK bumps required by Play, new icons baked into the
  wrapper). Rebuild with the **same keystore** and bump `versionCode`.

---

## Quick status checklist

| Item | State |
| --- | --- |
| PWA installability (manifest, SW, HTTPS, icons) | ✅ done |
| Maskable icons (192 + 512) | ✅ done |
| Manifest `id`, `categories`, `screenshots` | ✅ done |
| Play screenshots generated | ✅ `screenshots/` |
| `assetlinks.json` template | ✅ (fill in fingerprint) |
| Custom domain for origin-root asset links | ⬜ your call |
| Feature graphic 1024×500 | ⬜ can generate on request |
| Play Console account + listing + Data Safety | ⬜ your part |
