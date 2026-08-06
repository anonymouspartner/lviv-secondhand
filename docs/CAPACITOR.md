# Android app via Capacitor

This wraps the live PWA in a native Android shell using
[Capacitor](https://capacitorjs.com/). The wrapper lives in [`native/`](../native)
and is intentionally thin: it loads **`https://www.lvivsecondhand.com`** in a native
WebView.

> **Capacitor vs. the TWA route in [`PLAY_STORE.md`](PLAY_STORE.md):** both ship the
> same PWA to Google Play. A TWA (Bubblewrap / PWABuilder) is a lighter package and
> is enough if all you want is "the site, on the Play Store." Capacitor gives you a
> real native WebView plus a plugin bridge, so it's the better base **if you later
> want native capabilities** (native push via FCM, share sheets, in-app reviews,
> biometric locks, etc.). Pick one and stick with it — don't publish both under the
> same listing.

---

## Why it loads the live URL instead of bundling the site

`native/capacitor.config.json` sets `server.url` to the live domain. That means:

- **The store dataset is never shipped inside the APK.** An `.apk`/`.aab` is just a
  zip — anyone can unpack it. Bundling `index.html` would put the whole curated
  dataset on every device, which undercuts the data-protection work (removed export,
  proprietary licence). Loading remotely keeps the data server-side.
- **Content updates instantly.** Merge to `main` → the live site updates → the app
  shows it on next launch. You only rebuild the `.aab` when the *native wrapper*
  changes (package id, icons, SDK bumps) — same as a TWA.
- **Offline still works after first load**, because the live site registers its own
  service worker inside the WebView and caches the shell. A cold first launch with no
  network shows the branded retry page in [`native/www/index.html`](../native/www/index.html).

If you ever want a fully self-contained, first-launch-offline build instead, copy the
site into `native/www/` and delete the `server` block — but understand you're then
distributing the dataset in the binary.

---

## Prerequisites

- **Node.js 20+**
- **JDK 21** (Capacitor 7 requirement)
- **Android Studio** (bundles the Android SDK, platform 35, and an emulator), or the
  command-line SDK tools.

---

## Build it locally

```bash
cd native
npm install               # install Capacitor
npm run add:android       # generate the native android/ project (one time)

# (optional) branded icons + splash — see native/resources/README.md
npm run assets

npm run sync              # copy config + web fallback into the native project
npm run open:android      # open in Android Studio → Run ▶ on a device/emulator
```

`android/` is **git-ignored** — it's a generated artifact. Re-running
`npm run add:android` on a fresh clone recreates it. After any change to
`capacitor.config.json` or `native/www/`, run `npm run sync`.

### Command-line APK (no Android Studio)

```bash
cd native
npm install && npm run add:android
npm run build:debug        # → android/app/build/outputs/apk/debug/app-debug.apk
```

Sideload that `app-debug.apk` onto a phone to smoke-test.

### Build in CI

There's a manual GitHub Actions workflow —
**Actions → “Build Android (Capacitor)” → Run workflow** — that produces the same
debug APK as a downloadable artifact, so you don't need a local Android toolchain
just to try it on a device.

---

## Release build (signed `.aab` for Google Play)

1. **Create a keystore once** (keep it and the passwords backed up — losing them
   means you can never update the listing):

   ```bash
   keytool -genkey -v -keystore lviv-release.jks -alias lviv \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Point Gradle at it. Create `native/android/keystore.properties` (git-ignored):

   ```properties
   storeFile=/absolute/path/to/lviv-release.jks
   storePassword=…
   keyAlias=lviv
   keyPassword=…
   ```

   and wire it into `android/app/build.gradle`'s `signingConfigs` (Capacitor's docs:
   <https://capacitorjs.com/docs/android/deploying-to-google-play>).

3. Build the App Bundle:

   ```bash
   cd native
   npm run build:release     # → android/app/build/outputs/bundle/release/app-release.aab
   ```

4. Upload the `.aab` in Play Console. Follow
   [`PLAY_STORE.md`](PLAY_STORE.md) sections 4–6 for the listing, Data Safety form,
   and rollout — they apply identically to the Capacitor build.

---

## Deep links → open the app (optional)

The app already supports `?store=<id>` deep-links on the web. To make an
`https://www.lvivsecondhand.com/?store=…` link **open the installed app** instead of
the browser (Android App Links):

1. Get the app's signing SHA-256 fingerprint:
   - **Play App Signing** (recommended): Play Console → *Setup → App signing*.
   - or from your keystore: `keytool -list -v -keystore lviv-release.jks -alias lviv`
2. Put it in [`.well-known/assetlinks.json`](../.well-known/assetlinks.json), replacing
   `REPLACE_WITH_YOUR_APP_SIGNING_KEY_SHA256_FINGERPRINT` (the `package_name` is
   already set to `com.anonymouspartner.lvivsecondhand`). Commit — GitHub Pages serves
   it at `https://www.lvivsecondhand.com/.well-known/assetlinks.json`.
3. Add an intent filter with `android:autoVerify="true"` for the `https` host to
   `native/android/app/src/main/AndroidManifest.xml` (Capacitor docs → *Deep Links /
   App Links*). Because the WebView loads the same URL, the store opens directly.

---

## What's committed vs. generated

| Committed (in `native/`) | Generated / git-ignored |
| --- | --- |
| `package.json`, `capacitor.config.json` | `node_modules/` |
| `www/index.html` (offline fallback) | `android/` (native project) |
| `resources/README.md` | `*.apk`, `*.aab`, keystores |
