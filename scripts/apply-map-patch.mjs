#!/usr/bin/env node
// Step 1 of .github/workflows/update-map.yml: applies a single { store_id,
// updates } patch (from the repository_dispatch client_payload) to the
// matching entry in stores.json. Deep-merges plain objects (so a patch can
// touch just s.hours.mon without clobbering the rest of s.hours); arrays and
// primitives are replaced outright.
//
// Reads the event payload from GITHUB_EVENT_PATH (the JSON file Actions
// writes for every run) rather than a workflow-expression env var, so
// nested/quoted JSON in `updates` can't be mangled by shell interpolation.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const storesPath = resolve(here, '..', 'stores.json');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    target[k] = isPlainObject(v) && isPlainObject(target[k]) ? deepMerge(target[k], v) : v;
  }
  return target;
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is not set — this script must run inside a GitHub Actions job.');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const payload = event.client_payload;
  if (!payload || typeof payload !== 'object') throw new Error('Event has no client_payload.');

  const { store_id: storeId, updates } = payload;
  if (!storeId || typeof storeId !== 'string') throw new Error('client_payload.store_id is required.');
  if (!isPlainObject(updates)) throw new Error('client_payload.updates must be a plain object.');
  // id is the store's identity — a patch is never allowed to reassign it.
  if ('id' in updates) throw new Error('updates must not include "id" — it identifies which store to patch.');

  const stores = JSON.parse(readFileSync(storesPath, 'utf8'));
  if (!Array.isArray(stores)) throw new Error('stores.json is not an array.');
  const idx = stores.findIndex((s) => s && s.id === storeId);
  if (idx === -1) throw new Error(`No store with id "${storeId}" in stores.json.`);

  deepMerge(stores[idx], updates);
  writeFileSync(storesPath, JSON.stringify(stores, null, 1) + '\n');
  console.log(`Patched store "${storeId}":`, JSON.stringify(updates));
}

main();
