// Visit attribution — the one list of ?src= tags, and the one way to add one.
//
// The app (index.html) and the static store/chain pages read ?src=, keep it in
// sessionStorage (lviv_sh_src) for the tab, strip it from the address bar and
// send it with every metrics beacon. The metrics Worker groups by it. Every
// link we put somewhere else — a bot message, a channel post, an Instagram
// caption, a printed QR code — carries one of these, so the owner can see which
// channel actually brings people. docs/ATTRIBUTION.md explains each one.
//
// Imported by the Telegram bot, the metrics Worker and the build scripts.
// index.html and the generated pages have no build step, so they carry their
// own copies of the values they need; scripts/check-attribution.mjs fails CI if
// those drift from this file.
//
// NEVER on: canonical tags, og:url, sitemap.xml, or links inside our own pages
// that Google crawls — a ?src= variant must never become an indexable URL. Nor
// on payment/billing URLs, t.me deep links, mailto: or tel:.

export const SRC = Object.freeze({
  tgch: 'tgch',   // Telegram channel posts (@Lviv_Secondhand)
  tgbot: 'tgbot', // Telegram bot messages (@Secondhandlvivbot)
  ig: 'ig',       // Instagram captions and the Instagram bio link
  share: 'share', // the app's "copy link to this store" / "share the app"
  pwa: 'pwa',     // launches of the installed web app (manifest start_url)
  twa: 'twa',     // launches of the Android app (Capacitor shell, by user agent)
});

// Same rule as the app and the Worker: at most 16 characters of [A-Za-z0-9_-].
// Tags we mint are stricter still (lowercase, [a-z0-9-]), so a typo fails here
// instead of turning into a new, unexplained row in the stats.
const TAG_RE = /^[a-z0-9-]{1,16}$/;

// Per-store QR posters: qr-<storeid>, e.g. qr-c68. Store ids are at most a few
// characters (validate-stores.mjs: [a-z0-9]{1,12}), so this always fits in 16.
export function qrTag(storeId) {
  const tag = `qr-${storeId}`;
  if (!TAG_RE.test(tag)) throw new Error(`qrTag: "${tag}" is not a valid src tag`);
  return tag;
}

// Hosts whose links we tag: www, the apex and the city subdomains.
const OUR_HOST = /^(?:[a-z0-9-]+\.)?lvivsecondhand\.com$/;

// Add (or replace) src on a link to our own site. Other query parameters and
// the fragment are kept; anything that is not an http(s) link to our site is
// returned unchanged, so a caller can pass every link through this blindly.
export function withSrc(link, tag) {
  if (!TAG_RE.test(tag)) throw new Error(`withSrc: "${tag}" is not a valid src tag`);
  let u;
  try { u = new URL(link); } catch { return link; }
  if (!/^https?:$/.test(u.protocol) || !OUR_HOST.test(u.hostname)) return link;
  u.searchParams.set('src', tag);
  return u.toString();
}

// Tag every link to our site inside free text (a caption, a post). Full URLs
// get src set; with { bare: true } a bare mention such as
// "www.lvivsecondhand.com" or "lvivsecondhand.com/jobs" also becomes a full,
// tagged URL — right for Telegram, which turns bare domains into links anyway,
// wrong for Instagram, where a caption link is not clickable and a long URL is
// just noise. Email addresses (hello@lvivsecondhand.com) are left alone.
const LINK_IN_TEXT = /(?<![@\w.\/-])(https?:\/\/)?((?:[a-z0-9-]+\.)?lvivsecondhand\.com)(\/[^\s<>"'«»()]*)?/gi;
export function tagLinksInText(text, tag, { bare = false } = {}) {
  return String(text).replace(LINK_IN_TEXT, (m, scheme, host, rest = '') => {
    if (!scheme && !bare) return m;
    // A sentence can end right after the link; keep that punctuation outside it.
    const tail = (rest.match(/[.,;:!?]+$/) || [''])[0];
    const path = rest.slice(0, rest.length - tail.length) || '/';
    return withSrc(`${scheme || 'https://'}${host.toLowerCase()}${path}`, tag) + tail;
  });
}

// What a store's printed QR poster encodes (scripts/build-qr-posters.mjs), and
// what the bot says it opens: the store's deep link, tagged qr-<id>.
export const qrLink = (storeId) =>
  withSrc(`https://www.lvivsecondhand.com/?store=${encodeURIComponent(storeId)}`, qrTag(storeId));
