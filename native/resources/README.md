# App icon & splash source images

Drop two square PNGs here, then run `npm run assets` (from `native/`) to generate
every Android launcher-icon density and the splash screens automatically via
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

| File | Size | Notes |
| --- | --- | --- |
| `icon.png` | **1024 × 1024** | The app launcher icon. Use a full-bleed square (no rounded corners — Android masks it). Reuse the artwork behind the repo's `icon-512.png`, exported at 1024. |
| `icon-foreground.png` *(optional)* | 1024 × 1024 | Adaptive-icon foreground layer (transparent background). If omitted, `icon.png` is used. |
| `icon-background.png` *(optional)* | 1024 × 1024 | Adaptive-icon background layer. If omitted, a solid `#14472a` is used. |
| `splash.png` | **2732 × 2732** | Launch splash. Keep the logo centered within the middle ~1200 px (the edges get cropped on most phones). Background `#14472a`. |

Until you add these, the build falls back to Capacitor's default icons — the app
still installs and runs, it just won't carry the LSH branding on the home screen.

The `native/` folder is deliberately kept out of GitHub Pages' concern; nothing
here is served to the web app.
