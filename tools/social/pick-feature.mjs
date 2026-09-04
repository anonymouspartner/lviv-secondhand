// Picks which store to feature this week, for the scheduled run of
// instagram-feature.yml. Prints the chosen id on stdout and its reasoning on
// stderr; prints nothing at all when no store qualifies, which the workflow
// reads as "skip this week" rather than as a failure.
//
// WHY A PICKER RATHER THAN A LIST
// A hand-kept rotation list goes stale the moment a store is added, closes, or
// buys a promotion. Every rule below is re-evaluated from stores.json on the
// morning it runs, so the rotation follows the data instead of a file someone
// has to remember to edit.
//
// THE THREE RULES, IN THE ORDER THEY MATTER
//
// 1. Never feature a store that is currently PAYING for placement. The card
//    store-feature.mjs renders says "Не реклама — магазин не платив за це
//    розміщення". For an advertiser that sentence is still literally true (they
//    bought a pin, not this post), which is exactly what makes it the wrong
//    sentence to print: a reader cannot tell the difference, and the ambiguity
//    resolves in the direction that flatters us. Both promo sources are checked
//    — the static `promo` field in stores.json and the live self-fulfilled set
//    at /promos — because a store can be paying through either.
//
// 2. Never feature a store whose card would be mostly blanks. The whole claim of
//    a feature post is "here is a real shop you can walk to on a day worth
//    going" — so an address, a restock claim, and real opening hours are all
//    required. A store missing any of them is not rejected forever, just until
//    a field agent fills it in.
//
// 3. Prefer a store never featured before, oldest-featured first after that.
//    History is marketing/instagram/features/history.json, not the committed
//    .jpg files and not `git log`: the workflow checks out at depth 1, so the
//    commit dates those files would need are not in the clone.
//
// Inputs (all optional):
//   FEATURE_HISTORY   path to history.json
//   PROMOS_URL        live promo endpoint; set empty to skip the network call
//
// Run: node pick-feature.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const HISTORY = process.env.FEATURE_HISTORY
  ? resolve(repoRoot, process.env.FEATURE_HISTORY)
  : resolve(repoRoot, 'marketing/instagram/features/history.json');

// Same worker the app itself reads /promos from (index.html's METRICS_URL).
const PROMOS_URL = process.env.PROMOS_URL === undefined
  ? 'https://lviv-metrics.lshanalytic.workers.dev/promos'
  : process.env.PROMOS_URL;

const say = (...a) => console.error(...a);

const stores = JSON.parse(readFileSync(resolve(repoRoot, 'stores.json'), 'utf8'));

// Same activeness test deals-image.mjs uses, so "currently promoted" means the
// same thing in both places.
const activePromo = (s) =>
  s.promo && (!s.promo.until || new Date(s.promo.until + 'T23:59:59') >= new Date());

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// A day is known if it names hours or says closed — "?" is the unknown marker
// stores.json uses for a store nobody has surveyed yet.
const knownHours = (s) =>
  s.hours ? DAYS.filter((d) => s.hours[d] && s.hours[d] !== '?').length : 0;

// Mirrors store-feature.mjs's restockLine(): it prints a day, else an interval,
// else no claim at all. "No claim at all" is the case worth skipping.
const hasRestockClaim = (s) => Boolean(s.restockDay) || Number(s.cycle) >= 1;

let livePromos = {};
if (PROMOS_URL) {
  try {
    const res = await fetch(PROMOS_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) livePromos = await res.json();
    else say(`note: ${PROMOS_URL} returned HTTP ${res.status} — using stores.json promos only.`);
  } catch (e) {
    // Non-fatal by design. Rule 1 is a judgement call about optics, not a
    // correctness gate, and a marketing post should not be blocked by a
    // transient fetch failure — but say so out loud rather than silently.
    say(`note: could not read live promos (${e.message}) — using stores.json promos only.`);
  }
}

const rejected = { watermark: 0, promoted: 0, thin: 0 };
const eligible = stores.filter((s) => {
  if (s.watermark) { rejected.watermark++; return false; }
  if (activePromo(s) || livePromos[s.id]) { rejected.promoted++; return false; }
  if (!s.name || !s.address || !hasRestockClaim(s) || knownHours(s) < 5) { rejected.thin++; return false; }
  return true;
});

say(`${stores.length} stores → ${eligible.length} eligible ` +
    `(skipped ${rejected.watermark} placeholder, ${rejected.promoted} currently promoted, ${rejected.thin} too thin).`);

if (!eligible.length) {
  say('Nothing qualifies this week — printing no id so the run skips rather than posting a weak card.');
  process.exit(0);
}

let history = {};
if (existsSync(HISTORY)) {
  try {
    history = JSON.parse(readFileSync(HISTORY, 'utf8'));
  } catch (e) {
    // A corrupt history file must not silently restart the rotation from the
    // top — that would re-feature the same handful of stores forever.
    throw new Error(`${HISTORY} is not valid JSON (${e.message}); fix or delete it.`);
  }
}

// Never-featured first (history has no entry), then least-recently-featured.
// `id` breaks every tie so the same input always picks the same store — a
// re-run of a failed week posts the store that week was meant to post.
eligible.sort((a, b) => {
  const ta = history[a.id] || '';
  const tb = history[b.id] || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : 1;
});

const pick = eligible[0];
const last = history[pick.id];
say(`Picked ${pick.id} — ${pick.name} (${last ? `last featured ${last}` : 'never featured'}).`);
process.stdout.write(pick.id);
