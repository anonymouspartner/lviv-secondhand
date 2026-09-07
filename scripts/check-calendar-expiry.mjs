#!/usr/bin/env node
// Watchdog for the chains' published new-collection calendars.
//
// `restockDates` is the strongest signal the tracker has: a chain's own list of
// collection days, which beats every inferred cycle (see dayInfoFromDates in
// index.html). It is also the only signal in the dataset with an expiry date —
// the lists are copied off HUMANA's pinned calendar post once a year and run to
// the end of it. When they run out the app does not break or complain; it
// quietly falls back to extrapolating a fixed cycle, and the fallback drifts a
// week over a single irregular gap. That is exactly the kind of decay nobody
// notices until the dates are months wrong.
//
// So: warn while there is still time to act. Nothing here can be automated
// further — the dates live inside the pinned *image*, not in any post's text,
// so a human has to read them off it. (The daily price posts are text and are
// parsed automatically; see worker/chain-feed.mjs.)
//
// Prints nothing when every calendar is healthy, so the caller can treat any
// output as the alert. Run by .github/workflows/calendar-expiry.yml, monthly.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Two remaining dates is roughly two months of runway on a 35-day cycle —
// enough to notice the message, find the pinned post and copy the next year in.
const MIN_FUTURE_DATES = 2;

const here = dirname(fileURLToPath(import.meta.url));
const stores = JSON.parse(readFileSync(resolve(here, '..', 'stores.json'), 'utf8'));

const today = new Date().toISOString().slice(0, 10); // string compare on ISO dates
const short = [];
for (const s of stores) {
  if (!Array.isArray(s.restockDates) || !s.restockDates.length) continue;
  const future = s.restockDates.filter((d) => d >= today);
  if (future.length < MIN_FUTURE_DATES) {
    short.push({ id: s.id, name: s.name, left: future.length, last: s.restockDates[s.restockDates.length - 1] });
  }
}

if (!short.length) process.exit(0);

console.log(
  `⚠️ Published collection calendars are running out (${short.length} store(s)).\n` +
  short.map((s) => `· ${s.name} (${s.id}) — ${s.left} date(s) left, list ends ${s.last}`).join('\n') +
  `\n\nCopy the next dates off the pinned calendar in https://t.me/humanalviv ` +
  `into restockDates in stores.json. Until then these stores fall back to an ` +
  `extrapolated cycle, which drifts across an irregular gap.`
);
