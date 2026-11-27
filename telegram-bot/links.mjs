// Links to our site that the bot puts in messages. Kept out of worker.js so
// scripts/check-attribution.mjs can unit-test them (a Worker's entry module
// should not grow extra named exports).
//
// Every one carries src=tgbot (shared/attribution.mjs, docs/ATTRIBUTION.md).
// Inside an HTML-mode message a URL with two parameters contains a raw "&", so
// those call sites in worker.js wrap it in esc().
import { STORES, CITIES, CITY_STORES } from './stores.gen.js';
import { SRC, withSrc } from '../shared/attribution.mjs';

export const APP_URL = 'https://www.lvivsecondhand.com/';
export const site = (path = '') => withSrc(APP_URL + path, SRC.tgbot);

// The барахолка safety rules (market/bezpeka.html). Printed on every shipping
// listing's channel card, so it is tagged as a channel link (tgch), not a bot
// one: a reader taps it under a channel post.
export const marketSafetyLink = () => withSrc(APP_URL + 'market/bezpeka.html', SRC.tgch);

// Every store in STORES (stores.json minus the watermark, see build-data.mjs)
// has a static page at /store/<id>/ with its own canonical and an "open on the
// map" link. Linking that page, not ?store=<id> (which canonicals to the
// homepage), lets each link the bot sends count for the store in search. Any
// other id keeps the ?store=<id> deep link, which still opens the map as before.
const PAGE_IDS = new Set(STORES.map((s) => s.id));

// A city's own site (kyiv.lvivsecondhand.com, …) — the only host whose map
// loads that city's stores. An unknown slug falls back to the Lviv site.
const HOST_BY_SLUG = new Map(CITIES.map((c) => [c.slug, c.host]));
export const citySite = (slug, path = '') => {
  const host = HOST_BY_SLUG.get(slug);
  return host ? withSrc('https://' + host + '/' + path, SRC.tgbot) : site(path);
};
// Which city a non-Lviv store id belongs to, so its ?store= link opens on the
// host that knows it — on www the id is unknown and the link opened nothing.
const CITY_BY_STORE = new Map(Object.entries(CITY_STORES).flatMap(([slug, list]) => list.map((s) => [s.id, slug])));
export function storeLink(id) {
  if (PAGE_IDS.has(id)) return site('store/' + encodeURIComponent(id) + '/');
  return citySite(CITY_BY_STORE.get(id), '?store=' + encodeURIComponent(id));
}
