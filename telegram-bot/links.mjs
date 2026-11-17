// Links to our site that the bot puts in messages. Kept out of worker.js so
// scripts/check-attribution.mjs can unit-test them (a Worker's entry module
// should not grow extra named exports).
//
// Every one carries src=tgbot (shared/attribution.mjs, docs/ATTRIBUTION.md).
// Inside an HTML-mode message a URL with two parameters contains a raw "&", so
// those call sites in worker.js wrap it in esc().
import { STORES } from './stores.gen.js';
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
export function storeLink(id) {
  return PAGE_IDS.has(id)
    ? site('store/' + encodeURIComponent(id) + '/')
    : site('?store=' + encodeURIComponent(id));
}
