#!/usr/bin/env node
// Step 1 of .github/workflows/update-map.yml: applies a { store_id, updates }
// patch (from the repository_dispatch client_payload) to the matching entry in
// stores.json. Deep-merges plain objects (so a patch can touch just s.hours.mon
// without clobbering the rest of s.hours); arrays and primitives are replaced.
//
// Reads the event payload from GITHUB_EVENT_PATH (the JSON file Actions writes
// for every run) rather than a workflow-expression env var, so nested/quoted
// JSON in `updates` can't be mangled by shell interpolation.
//
// Two modes:
//   (default)    overwrite — the patch wins. Used by flows where a human has
//                already confirmed the value: the bot's store survey, and
//                /restock/approve.
//   'fill-gaps'  only writes where the map currently holds nothing, plus a
//                strictly-newer restock_date. Used for contributions approved
//                in bulk, where "the map has no phone number and someone sent
//                one" is safe to apply unattended but "someone disagrees with
//                a value we already hold" is a judgment call. Anything skipped
//                is reported so it can be raised for a human instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// STORES_PATH lets the test harness point this at a fixture instead of the
// real dataset; unset everywhere else, so the workflow always hits stores.json.
const storesPath = process.env.STORES_PATH || resolve(here, '..', 'stores.json');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    target[k] = isPlainObject(v) && isPlainObject(target[k]) ? deepMerge(target[k], v) : v;
  }
  return target;
}

// What counts as "the map holds nothing here". '?' is the dataset's own
// placeholder for an unknown opening time, so it is a gap, not a value.
function isGap(v) {
  return v === undefined || v === null || v === '' || v === '?';
}

// Applies only what can't contradict something already recorded. Returns the
// fields written and the fields declined, each with a reason, so the caller can
// escalate the declines rather than dropping them silently.
export function applyFillGaps(store, updates) {
  const applied = {};
  const skipped = [];
  for (const [k, v] of Object.entries(updates)) {
    if (k === 'hours' && isPlainObject(v)) {
      const days = {};
      for (const [d, t] of Object.entries(v)) {
        if (isGap(t)) continue;
        if (isGap(store.hours ? store.hours[d] : undefined)) days[d] = t;
        else if (String(store.hours[d]) !== String(t)) {
          skipped.push({ field: `hours.${d}`, have: store.hours[d], proposed: t, why: 'would overwrite a recorded value' });
        }
      }
      if (Object.keys(days).length) {
        store.hours = Object.assign({}, store.hours, days);
        applied.hours = days;
      }
      continue;
    }
    if (isGap(v)) continue;
    // A proposed `false` on a flag the store doesn't set asserts nothing: absent
    // and false already behave identically everywhere that reads them, so
    // recording it would only add a field. If the store has the flag ON, then
    // proposing false IS a real change and falls through to the decline below.
    if (v === false && isGap(store[k])) continue;
    // A restock observation is the one field where newer genuinely wins: the
    // map wants the most recent delivery, and ISO dates compare as strings.
    if (k === 'restock_date') {
      if (isGap(store[k]) || String(v) > String(store[k])) { store[k] = v; applied[k] = v; }
      else if (String(v) !== String(store[k])) {
        skipped.push({ field: k, have: store[k], proposed: v, why: 'older than the date on record' });
      }
      continue;
    }
    if (isGap(store[k])) { store[k] = v; applied[k] = v; continue; }
    if (String(store[k]) !== String(v)) {
      skipped.push({ field: k, have: store[k], proposed: v, why: 'would overwrite a recorded value' });
    }
  }
  return { applied, skipped };
}

// Metres between two pins. Only used to spot an addition landing on top of a
// store already on the map.
function metresBetween(a, b) {
  const t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Deliberately NOT bounded to Lviv: EconomClass runs real branches in
// Drohobych, Stryi, Sokal, Chervonohrad and elsewhere, 30–75 km out. A
// bounding box would reject them. This only rejects coordinates that can't be
// a place at all.
function coordsLookReal(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

const DUPLICATE_RADIUS_M = 60;

// Next free c-id. Reuses nothing: ids of removed stores stay retired so an old
// QR poster or shared link can never resolve to a different shop.
function nextStoreId(stores) {
  let max = 0;
  for (const s of stores) {
    const m = /^c(\d+)$/.exec(s && s.id ? s.id : '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'c' + (max + 1);
}

export function addStore(stores, proposed) {
  const lat = Number(proposed && proposed.lat), lng = Number(proposed && proposed.lng);
  const name = proposed && typeof proposed.name === 'string' ? proposed.name.trim() : '';
  if (!name) return { rejected: 'no name' };
  if (!coordsLookReal(lat, lng)) return { rejected: 'coordinates are not a real location' };

  // A new pin sitting on top of an existing store is the failure this map keeps
  // hitting — c12, c13 and two re-submitted stores were all found that way. It
  // is reported rather than added: a missed addition becomes an issue, whereas
  // a duplicate on the live map sends someone to a shop that isn't there.
  let nearest = null;
  for (const s of stores) {
    if (!s || s.watermark || !Number.isFinite(s.lat)) continue;
    const d = metresBetween({ lat, lng }, s);
    if (!nearest || d < nearest.d) nearest = { d, s };
  }
  if (nearest && nearest.d <= DUPLICATE_RADIUS_M) {
    return { rejected: `${Math.round(nearest.d)} m from ${nearest.s.id} (${nearest.s.name}) — possible duplicate` };
  }

  const id = nextStoreId(stores);
  const store = { id, name, lat, lng, cycle: Number(proposed.cycle) || 7 };
  for (const k of ['brand', 'address', 'addressEn', 'phone', 'type', 'pricing', 'note', 'hours', 'restockDay', 'restock_date', 'dailyDrop']) {
    if (proposed[k] !== undefined && proposed[k] !== null && proposed[k] !== '') store[k] = proposed[k];
  }
  if (!store.brand) store.brand = 'Independent';
  if (!store.type) store.type = 'other';
  stores.push(store);
  return { added: id, nearestMetres: nearest ? Math.round(nearest.d) : null };
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is not set — this script must run inside a GitHub Actions job.');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const payload = event.client_payload;
  if (!payload || typeof payload !== 'object') throw new Error('Event has no client_payload.');

  const { mode } = payload;
  // Two accepted shapes. The original single patch — { store_id, updates } —
  // is what the bot survey and /restock/approve still send. A batch —
  // { patches: [{ store_id, updates }] } — lets one approved contribution
  // touching a dozen stores be one workflow run, one commit and one report,
  // instead of a dozen runs queued behind each other each opening its own issue.
  const batch = Array.isArray(payload.patches) ? payload.patches
    : payload.store_id ? [{ store_id: payload.store_id, updates: payload.updates }]
    : [];
  const hasAddsOrRemoves = Array.isArray(payload.adds) || Array.isArray(payload.removes);
  // A contribution can consist purely of additions or removals, with no field
  // patches at all — that is not an empty payload.
  if (!batch.length && !hasAddsOrRemoves) throw new Error('client_payload carried nothing to apply.');

  const raw = readFileSync(storesPath, 'utf8');
  const stores = JSON.parse(raw);
  if (!Array.isArray(stores)) throw new Error('stores.json is not an array.');

  const results = [];
  for (const item of batch) {
    const storeId = item && item.store_id;
    const updates = item && item.updates;
    if (!storeId || typeof storeId !== 'string') throw new Error('each patch needs a string store_id.');
    if (!isPlainObject(updates)) throw new Error(`patch for "${storeId}": updates must be a plain object.`);
    // id is the store's identity — a patch is never allowed to reassign it.
    if ('id' in updates) throw new Error('updates must not include "id" — it identifies which store to patch.');

    const idx = stores.findIndex((s) => s && s.id === storeId);
    if (idx === -1) {
      // In fill-gaps mode an unknown id is a fact to report, not a crash: a
      // contribution can legitimately mention a store the map doesn't hold yet,
      // and failing the whole batch would discard the patches that were fine.
      // The overwrite callers pass ids they just read out of stores.json, so
      // there it still means something is genuinely wrong.
      if (mode === 'fill-gaps') {
        results.push({ store_id: storeId, applied: {}, skipped: [], missing: true });
        console.log(`Store "${storeId}" is not on the map — reported, not applied.`);
        continue;
      }
      throw new Error(`No store with id "${storeId}" in stores.json.`);
    }

    if (mode === 'fill-gaps') {
      const r = applyFillGaps(stores[idx], updates);
      results.push({ store_id: storeId, ...r });
      console.log(`Patched store "${storeId}" (fill-gaps): applied ${JSON.stringify(r.applied)}`);
      if (r.skipped.length) console.log(`  declined ${r.skipped.length} field(s): ${JSON.stringify(r.skipped)}`);
    } else {
      deepMerge(stores[idx], updates);
      results.push({ store_id: storeId, applied: updates, skipped: [] });
      console.log(`Patched store "${storeId}":`, JSON.stringify(updates));
    }
  }
  // Additions and removals, which a field patch cannot express. Both are only
  // honoured in fill-gaps mode — the overwrite callers patch one known store.
  const added = [], removedIds = [], rejectedAdds = [];
  if (mode === 'fill-gaps') {
    for (const proposed of (Array.isArray(payload.adds) ? payload.adds.slice(0, 50) : [])) {
      const r = addStore(stores, proposed);
      if (r.rejected) {
        rejectedAdds.push({ name: (proposed && proposed.name) || '(unnamed)', why: r.rejected });
        console.log(`Declined to add "${(proposed && proposed.name) || '(unnamed)'}": ${r.rejected}`);
      } else {
        added.push({ id: r.added, name: proposed.name });
        console.log(`Added "${proposed.name}" as ${r.added}`);
      }
    }
    for (const rid of (Array.isArray(payload.removes) ? payload.removes.slice(0, 50) : [])) {
      const idx2 = stores.findIndex((x) => x && x.id === rid);
      if (idx2 === -1) { console.log(`Nothing to remove for "${rid}".`); continue; }
      const gone = stores.splice(idx2, 1)[0];
      removedIds.push({ id: rid, name: gone.name });
      console.log(`Removed ${rid} ("${gone.name}")`);
    }
  }

  const report = {
    mode: mode || 'overwrite',
    stores: results,
    added,
    removed: removedIds,
    rejectedAdds,
    // What a human still has to look at.
    needsReview: results.filter((r) => r.missing || (r.skipped && r.skipped.length)),
  };

  // Indent 2 — stores.json is written with 2 everywhere else (the generators,
  // and every hand edit). Writing 1 here reformatted all 130 records on the
  // first automated patch, burying a one-field change in a whole-file diff.
  writeFileSync(storesPath, JSON.stringify(stores, null, 2) + '\n');

  if (process.env.PATCH_REPORT_FILE) {
    writeFileSync(process.env.PATCH_REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  }
}

// Importable for the test harness; only runs the workflow path when executed
// with an Actions event present.
if (process.env.GITHUB_EVENT_PATH) main();
